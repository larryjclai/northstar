# Plan 222: 分帳 UI — share legs in the split editor, list, and edit round-trip

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report — do not improvise. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 4f9356fa..HEAD -- src/routes/CashFlowRoute.tsx src/routes/splitEntryState.ts src/domain/splitLegs.ts`
> Mismatch with the excerpts below = STOP.

## Status

- **Priority**: P2
- **Effort**: M–L
- **Risk**: MED (UI over a tested foundation; the foundation's invariants and
  errors are the contract — UI never re-implements math)
- **Depends on**: plan 221 (merged — foundation), plans 181/182 (merged — split editor)
- **Category**: direction (分帳 phase 2, roadmap)
- **Planned at**: commit `4f9356fa`, 2026-07-19

## Why this matters

Plan 221 shipped the 分帳 data layer: a `"share"` leg = someone else's portion
of a purchase, posted as a 代墊 `counterAccountId` pass-through (bank drops by
the FULL paid amount, 應收 account rises by the share, the user's own expense
is only their category legs — reconciliation-tested on both harnesses). No UI
reaches it. This plan adds 分帳 to the EXISTING split editor (plan 182's
MOZE-style 多類別 mode), the ledger list collapse, and the edit round-trip.

**Foundation contract (from plan 221 — the UI must call, never re-implement):**

```ts
// src/domain/splitLegs.ts
export interface SplitShareInput { amount: number; counterparty: string; counterAccountId: string }
buildSplitLegs(shared, legs, groupId, shares: SplitShareInput[] = [])
// src/data/repositories.ts interface
createSplit(shared, legs, shares?): Promise<void>
updateSplit(groupId, shared, legs, shares?): Promise<void>
// Builder errors the UI should surface verbatim (thrown zh-TW):
// 分帳僅支援支出。/ 拆分至少需要 2 筆明細。/ 分帳需要至少 1 筆自己的類別明細。/
// 分帳明細金額必須大於 0。/ 分帳明細必須填寫對象。/ 分帳明細必須選擇應收帳戶。/ 找不到應收帳戶。
// Share draft shape the repo writes: name = counterparty, category = "",
// legKind = "share", counterAccountId set, amount negative (expense sign).
```

## Current state

All at `4f9356fa`:

- `src/routes/splitEntryState.ts` — pure split-editor state (17 tests):
  `SplitLegDraftState { amount: string; category; subcategory }`,
  `enterSplitMode`, `addSplitLeg`, `updateSplitLeg`, `removeSplitLeg`,
  `shouldExitSplitMode(legs)` (exits at ≤1 leg), `derivedSplitTotal`,
  `splitLegsError`, `toSplitLegInputs`, `parseSplitLegAmount`.
- `src/routes/CashFlowRoute.tsx`:
  - `:246-247` — `splitLegs: SplitLegDraftState[] | null` + `editingSplitGroupId`.
  - `:548-555` — `splitGroupRowsFor(row)`: **requires
    `rows.every((r) => r.legKind === "category")`** — a group containing share
    legs fails this and never enters split edit. MUST widen.
  - `:894-928` — the split save path: builds `shared: SplitSharedFields`, calls
    `updateSplitMutation.mutateAsync({ groupId, shared, legs })` /
    `createSplitMutation.mutateAsync({ shared, legs })` (find the two mutation
    wrappers by grepping `createSplitMutation` — their input types gain `shares`).
  - `:3318-3375` — the 多類別明細 editor (per-leg rows + 新增分類 dashed button
    + `splitError`). The 分帳 section mirrors this structure below it.
  - `:3901-3910` — list collapse: entry condition `row.legKind === "category"`,
    legs lookup filters `r.legKind === "category"` — share legs currently fall
    out of the collapse and render as loose rows. MUST include `"share"` in both
    (collapsed `amount: total` then equals the FULL bank posting — correct: it
    matches what left the account; spend analytics use RAW rows and are
    unaffected — plan 182's aggregation audit).
  - `:2439-2485` — expanded split legs display (`拆分 N 筆` badge + per-leg rows
    showing `leg.category`); share legs need `分帳 · ${leg.name}` display.
  - `:3590-3591` + `:2841-2842` — the 代墊 帳戶 picker precedent: full account
    list, deliberately cross-book. The share row's 應收帳戶 select follows it.
    Account options source: `accountRows` (grep its select usage, e.g. the ar
    收款帳戶 select) via the repo's `AppSelect` component.
  - Income guard: 221 throws 分帳僅支援支出 — the UI hides the 分帳 section
    when the drawer type is `income` (split mode itself stays available).
- `src/domain/groupClassifier.ts:5-19` — `classifyLedgerGroup`: a
  category+share group is same-account, all-negative → verify it classifies as
  `"split"` (read the rest of the function; expected yes since transfers need
  2 accounts + a positive leg). If NOT, STOP.
- `src/domain/ledgerTrust.ts:180-186` — `incompleteSplitGroupIds` already
  counts category+share (221). No change.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Lint      | `npm run lint`     | 0 errors / 761 warnings |
| One suite | `npx vitest run src/routes/splitEntryState.test.ts` | pass |
| Tests     | `npm test`         | 1392 + new pass     |

## Scope

**In scope**: `src/routes/splitEntryState.ts` (+ its test),
`src/routes/CashFlowRoute.tsx`, `src/data/hooks.ts` ONLY IF the split mutations
live there (follow the grep).
**Out of scope**: `domain/splitLegs.ts`, `repositories.ts` (foundation is
frozen — the UI adapts to IT); settle flow for share legs (repayment = a
transfer from the 應收帳戶, existing UX — no new settle UI); 未結清 surfaces
(share legs are settled-status pass-throughs, they don't appear there);
installment/外幣 gating (split affordance already hidden there — keep);
`groupClassifier.ts` (verify-only).

## Git workflow

- Branch: `feat/ai-share-legs-ui` off `main`. Conventional commit. No push/merge.

## Steps

### Step 1: Share draft state (pure)

In `splitEntryState.ts` add, mirroring the leg helpers' style:

```ts
export interface SplitShareDraftState { amount: string; counterparty: string; counterAccountId: string }
export function makeEmptyShareDraft(): SplitShareDraftState
export function addShareDraft(shares) / updateShareDraft(shares, i, patch) / removeShareDraft(shares, i)
export function derivedShareTotal(shares): number            // Σ parsed amounts (blank/invalid → 0)
export function shareDraftsError(shares): string | null      // per-row: amount>0, counterparty non-empty, counterAccountId non-empty — REUSE the builder's exact zh-TW strings
export function toShareInputs(shares): SplitShareInput[]
```

Amend `shouldExitSplitMode(legs)` → `shouldExitSplitMode(legs, shares)`: exit
to plain form only when `legs.length <= 1 && shares.length === 0` (1 category
leg + ≥1 share is a VALID 分帳 — the foundation's combined-≥2 rule). Update its
existing callers and tests for the new arg.

**Verify**: `npx vitest run src/routes/splitEntryState.test.ts` → existing pass
+ new share-helper tests (≥5: add/update/remove, error strings match the
builder's, exit rule with shares present).

### Step 2: Drawer state + editor UI

In `CashFlowRoute.tsx`:
1. Beside `splitLegs` state add `const [shareDrafts, setShareDrafts] = useState<SplitShareDraftState[]>([]);`
   Reset to `[]` everywhere `splitLegs` resets to null (grep `setSplitLegs(null)` — every site).
2. Below the 多類別明細 block (`:3318-3375`), when `splitMode && type === "expense"`,
   render a 分帳 section styled like the leg rows: per-share row = 對象 text
   input (placeholder 「小明」) + amount input (same 110px numeric style) +
   應收帳戶 `AppSelect` over `accountRows` (full list, 代墊 precedent) + remove
   button; below, a dashed 「+ 分帳」 button (mirror 新增分類's style) calling
   `addShareDraft`. Caption under the section:
   「分帳金額由「應收帳戶」暫記（代墊），對方還款時從該帳戶轉帳回來即可。不計入你的支出。」
3. Total display (`:3204-3206` copy + wherever `derivedSplitTotal` renders):
   total = `derivedSplitTotal(splitLegs) + derivedShareTotal(shareDrafts)`;
   update the caption to 「總金額為分類與分帳明細金額的加總。」
4. Income: when the user switches a split to 收入 with shares present, clear
   `shareDrafts` (mirror how `changeType` already clears split state on
   type exit, `:630` area) — never let an income save reach the builder's
   分帳僅支援支出 throw.

**Verify**: `npx tsc --noEmit` → 0.

### Step 3: Save path

In the split save branch (`:894-928`): validate `shareDraftsError(shareDrafts)`
alongside `splitLegsError`; pass `shares: toShareInputs(shareDrafts)` through
both mutations (widen the mutation wrappers' input types; they call
`repo.createSplit(shared, legs, shares)` / `repo.updateSplit(groupId, shared, legs, shares)`).
Success toast for creates with shares: `已新增拆分交易（N 筆分類、M 筆分帳）`
(keep the existing string when M = 0).

**Verify**: `npx tsc --noEmit` → 0.

### Step 4: Edit round-trip + list

1. `splitGroupRowsFor` (`:548-555`): widen the `every` to
   `r.legKind === "category" || r.legKind === "share"`.
2. `startSplitEdit` (grep it): hydrate `shareDrafts` from the group's
   `legKind === "share"` rows (`counterparty: row.name`,
   `amount: String(Math.abs(row.amount))`, `counterAccountId: row.counterAccountId ?? ""`)
   and `splitLegs` from category rows as today. `startDuplicate`'s split path
   hydrates shares too (fresh group on save — existing duplicate semantics).
3. List collapse (`:3901-3910`): include `"share"` in the entry condition and
   the legs filter. The collapsed row's `amount: total` now equals the full
   bank posting — intended.
4. Expanded legs display (`:2479` area): share legs render
   `分帳 · ${leg.name}` where category legs show their category; keep amounts
   as-is.
5. Verify (read-only) `classifyLedgerGroup` returns `"split"` for a
   category+share group — cite the line in your report. If it doesn't, STOP.

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0/761; `npm test` → all pass.

### Step 5: Live check (dev server)

With demo data: 記帳 → 支出 → pick category →「＋ 分類」→ set leg 400 → 「+ 分帳」
→ 對象 小明 / 600 / pick an account → save. Confirm: collapsed row shows −1000
+ 拆分 3 筆 badge (2 user legs + … verify actual count semantics = user legs);
expand shows the category leg + 分帳 · 小明; the paying account moved −1000,
the 應收帳戶 +600; 支出 analytics count only 400. Re-edit: both sections
hydrate; change 600→700, save, still ONE group (tombstone+recreate).

## Test plan

Step 1's pure tests carry the state machine. The reviewer re-runs the step-5
live pass (this doubles as the long-outstanding 182 live pass — note both
flows' results).

## Done criteria

- [ ] Gates green with new splitEntryState tests
- [ ] `grep -n "share" src/routes/splitEntryState.ts` shows the draft helpers
- [ ] `splitGroupRowsFor` + list collapse accept share legs
- [ ] Step-5 live flow: balances −1000 / +600, expense 400, edit round-trips
- [ ] No files outside scope modified

## STOP conditions

- The foundation signatures differ from the contract block above (drift).
- `classifyLedgerGroup` does NOT classify a category+share group as "split".
- The split mutations' wrapper location/shape can't accept the extra param
  without touching `repositories.ts`.
- Any 182 splitEntryState test needs a semantic (not signature) change.

## Maintenance notes

- Settle UX (one-tap 還款 from a share leg) is the natural NEXT step — record
  as a follow-up, don't build here.
- The 拆分 badge count now includes share legs; if a future design wants
  「拆分 2 筆 · 分帳 1 筆」 split copy, it's display-only.
- Fee legs (手續費, legKind null) remain excluded from all of this by the
  legKind checks — plan 226's fee-edit lookup depends on that; don't widen any
  filter to legKind null.
