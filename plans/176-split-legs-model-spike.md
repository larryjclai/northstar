# Plan 176: Split-legs data-model spike — one schema decision to serve both 分帳 and 多類別

> **Executor instructions**: This is a **design spike, not a build plan**. The
> deliverable is a decision document; the only code output is (optionally) a
> type sketch in the doc, never in `src/`. If anything in "STOP conditions"
> occurs, stop and report. When done, update the status row in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4ac63576..HEAD -- src/domain/types.ts src/data/repositories.ts src/data/migrations.ts ROADMAP.md`
> On drift, re-verify the "Current state" claims before proceeding.

## Status

- **Priority**: P3
- **Effort**: M (spike only)
- **Risk**: LOW (doc-only)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `4ac63576`, 2026-07-12

## Why this matters

ROADMAP.md 規劃中 lists two features that both decompose one transaction into
parts:

- **分帳** —「記錄一筆支出中誰佔多少（選擇性建立應收/應付）」
- **多類別** —「同一時間地點的一筆消費可拆多類別（如家樂福同時買傢俱與食物），群組式記帳」

The codebase has already invented **at least three** bespoke "linked record
group" mechanisms: the linked-fee-leg (income/transfer fees as a second ledger
row tied to the first), `dripGroupId` (dividend + reinvestment as one group),
and the installments engine (one purchase → N scheduled rows). Building 分帳
and 多類別 separately would predictably mint mechanisms #4 and #5, each with
its own sync, reporting, and reconciliation edge cases. One split-legs schema
decision, made now while the alpha explicitly reserves the right to break the
schema (README/AGENTS: not backward-compatible before GA), is dramatically
cheaper than converging four mechanisms after GA. This spike produces that
decision document; it does not build anything.

## Current state (verify each during Step 1 — cite exact lines in the doc)

- `src/domain/types.ts` — `LedgerTransaction` shape; how the existing linked
  mechanisms mark relationships. Find: the fee-leg linkage (grep
  `linked`/`feeLeg`/`fee-leg` across `src/domain/` and
  `src/data/repositories.ts` — `repositories.ledger-fee.test.ts` documents the
  behavior), `dripGroupId` (grep in types + `drip-plan.md`), installments
  (`src/domain/installments.ts` + `repositories.installments.test.ts`).
- `src/data/migrations.ts` — how schema migrations are written and tested
  (`repositories.migration.test.ts`); any split model lands as one of these.
- Sync: records sync individually with LWW per record
  (`src/features/connect/sync/`) — a split whose legs sync as separate records
  can arrive partially; the doc must address partial-arrival semantics (the
  fee-leg mechanism presumably already faces this — find out how/whether it
  handles it, e.g. in `pull.ts` or recompute logic).
- AR/AP machinery: 應收應付 + 代墊 exist (roadmap Shipped ①) — 分帳's
  "選擇性建立應收/應付" should reuse them; find the record shape (grep
  `receivable`/`應收` in `src/domain/`).
- Consumers that must stay correct under splits (list in the doc with entry
  points): category spend/budgets (`categorySpend.ts`, `budgetRollover.ts`),
  cash-flow grouping (`cashFlowGrouping.ts`), dashboard summary
  (`dashboardSummary.ts`), CSV export (`data/csv.ts`), reconciliation
  invariant (assets − liabilities = net worth), sync.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Search  | `grep -rn <pattern> src/` | evidence lines |
| Tests (read-only baseline) | `npm test` | all pass (unchanged) |

## Scope

**In scope**:
- `docs/split-legs-plan.md` (create — the decision document)

**Out of scope** (do NOT touch):
- Everything in `src/` and `src-tauri/` — zero code changes.
- Deciding to ship 分帳/多類別 at all — that stays with the operator; the doc
  gives them a decidable proposal.

## Git workflow

- Branch: `feat/ai-split-legs-spike`
- One commit: `docs(spike): split-legs data model for 分帳 + 多類別`
- Do NOT push or merge.

## Steps

### Step 1: Map the existing group mechanisms

For each of fee-leg / dripGroupId / installments (and any fourth you find —
grep `groupId` across `src/domain/`): record in the doc its linkage field(s),
creation path, deletion/edit cascade behavior, sync behavior, and how
reporting (category spend, net worth) treats the members. Evidence as
`file:line`.

**Verify**: the doc's mechanism table has ≥ 3 rows, every cell evidenced.

### Step 2: Draft the unified model

Propose ONE model covering both features — the obvious candidate shape (to be
validated, not assumed): a parent transaction carrying total amount +
merchant/date/account, with N **legs** each holding `{amount, category,
counterparty?}` where a counterparty leg can spawn an AR/AP record via the
existing 代墊 machinery. For the proposal, specify: storage (same table with
`parentId` + leg kind? separate legs table?), invariants (legs sum to parent
total — enforced where?), edit/delete cascades, sync semantics under LWW with
partial arrival, backward migration for existing plain transactions (ideally:
none needed — a plain transaction is a parent with zero legs), and the impact
on each consumer listed in Current state (one line each: unchanged /
needs-change-how).

**Verify**: every consumer from the Current-state list appears in the impact
table.

### Step 3: Alternatives + recommendation + open questions

- At least one genuine alternative (e.g. keep 多類別 as pure category-split
  legs but implement 分帳 entirely on the existing AR/AP records without a
  parent/leg schema) with an honest cost/benefit line.
- A recommendation and the reasons in ≤ 5 sentences.
- Operator questions (e.g. does a leg get its own date? can splits nest? UI
  entry point) — each with a suggested default.
- A phased build sketch (schema+migration → repository/recompute → sync →
  one UI entry → reports) sized S/M/L per phase.

**Verify**: doc complete; `npm test` still all pass (nothing touched).

## Test plan

None (doc-only). The build sketch inside the doc must, however, name the test
files each phase would extend (`repositories.migration.test.ts`,
`categorySpend.test.ts`, `sync.test.ts`, …).

## Done criteria

- [ ] `docs/split-legs-plan.md` exists with: mechanism table, unified-model
      proposal with invariants + consumer-impact table, ≥ 1 alternative,
      recommendation, operator questions, phased sketch
- [ ] `git status` shows ONLY the new doc (and the plans/README.md row update)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The fee-leg or installments mechanism turns out to be mid-refactor on main
  (drift check hits) — re-inventory before drafting.
- You cannot determine how partial sync arrival is handled for existing
  linked records after reading `pull.ts` and the recompute path — record it
  as an open risk in the doc and continue (this one is note-and-continue, not
  stop), but if the WHOLE sync model contradicts per-record LWW, stop.

## Maintenance notes

- This doc gates any future 分帳/多類別 build plan; those plans must cite it.
- If the operator rejects the unified model, record the rejection in
  `plans/README.md`'s rejected-findings ledger so it isn't re-proposed.
