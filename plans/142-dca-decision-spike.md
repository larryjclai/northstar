# Plan 142: DCA (定期定額/定股) — finish-or-retire decision document

> **STATUS: DONE — executed, reviewed, MERGED @ merge of `06916764` into main
> (2026-07-18).** Deliverable `docs/dca-decision.md` (335 lines, 6 sections).
> Advisor spot-verified the doc's central claims against source: `postRecurringInvestment`
> exists (manual post, `repositories.ts:1915`/`:3982`), `postDueRecurringInvestments`
> does NOT exist (grep exit 1 — confirms reminder, not auto-post; contrast the
> cash-flow auto-scheduler `postDueRecurringTransactions` at `hooks.ts:160`), both
> `fixedAmount`/`fixedShares` modes in `types.ts:340`, type doc self-describes as
> "surfaced as a reminder; posting is a manual one-tap". **Recommendation: Option A
> (rework & re-enable)** — the one real gap is stale reference-price handling; two
> flagged "open questions" were already correctly resolved in shipped code. STOP
> condition did not fire (6b479416 = a pause, not a retire decision). 8-item S–M
> worklist in §6 ready for a future `/improve plan`. **Operator's finish/retire call
> is now unblocked — read `docs/dca-decision.md`.**

> **Executor instructions**: This is a DESIGN/SPIKE plan — the deliverable is
> a decision document, NOT code. Do not modify any source file. Write the
> deliverable to `docs/dca-decision.md`. On a STOP condition, stop and
> report. Update this plan's status row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 1f6d5ec9..HEAD -- src/routes/RecurringInvestmentsTab.tsx src/routes/InvestmentsRoute.tsx src/data/repositories.ts`
> If DCA was un-hidden or removed since planning, STOP — the decision may
> already be made.

## Status

- **Priority**: P3
- **Effort**: S–M (investigation + writing)
- **Risk**: —
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `65fe04c1`, 2026-07-09
- **Refreshed at**: commit `1f6d5ec9`, 2026-07-17 (reconcile) — finding re-verified
  intact; all "Current state" anchors below re-located at this SHA. The three
  in-scope files changed heavily since `65fe04c1` (帳本 188–194 rewired
  `repositories.ts`; plans 165/201 redesigned `InvestmentsRoute.tsx`) but none of
  it touched the DCA decision itself.

## Why this matters

DCA is in limbo: the feature was built, then hidden (commit `6b479416`) —
`InvestmentsRoute.tsx:427`: "定期定額 (recurring DCA) is hidden until the
workflow is finalised; the tab + dashboard reminder are removed while the
underlying data and RecurringInvestmentsTab component stay intact for
re-enabling later." ROADMAP lists it as 「重做 — 待方向定案後重做再開」, and
README still advertises it (being fixed by plan 139). The maintainer flagged
the direction call as open. An open loop costs: dead-but-maintained code
(RecurringInvestmentsTab is still style-migrated, sync-schema'd, etc.), a
README promise, and a recurring "should we?" tax. This spike assembles what
the decision needs so the operator can make it in one sitting.

## Current state (starting points — verify and deepen; anchors re-located at `1f6d5ec9`)

- `src/routes/InvestmentsRoute.tsx:479-481` — the hiding comment ("定期定額
  (recurring DCA) is hidden until the workflow is finalised; the tab + dashboard
  reminder are removed while the underlying data and RecurringInvestmentsTab
  component stay intact for re-enabling later"); the tab renders at `:552`
  (`{tab === "recurring" ? <RecurringInvestmentsTab /> : null}`) but no tab
  control reaches that value.
- `src/routes/RecurringInvestmentsTab.tsx` — the hidden UI (still present,
  still style-maintained: plan 217 just touched its sibling `RecurringRulesTab`).
- `src/data/repositories.ts` — `createRecurringInvestmentRow` consumed at
  `:1714` (browser repo) and `:3671` (SQLite repo, `insertRecurringInvestmentRow`);
  entity normalization at `:5490` (`if (entity === "recurringInvestment")
  payload.isActive = Boolean(payload.isActive)`). Tests:
  `repositories.recurring-investments.test.ts` — the logic is TESTED.
- **Sync: DCA rows DO participate** — `recurringInvestment` appears in
  `src/features/connect/sync/pull.ts`, `src/domain/sync.ts`, and the
  repositories normalization above. Option B (retire) therefore has sync-schema
  ramifications (tombstones for a retired entity type) the doc must cover.
- **Local backup includes it too** (post-planning addition, roadmap 5.1):
  `src/features/local-backup/backupDiff.ts:34` diffs `recurringInvestments`
  (「週期投資」row). Retirement touches backup/restore snapshot shape — see
  plan 192's `RepositorySnapshot` precedent.
- Git archaeology: `git log --oneline --all -- src/routes/RecurringInvestmentsTab.tsx`
  and `git show 6b479416` ("feat(investments): hide DCA (定期定額) feature;
  rename analytics Total→All") — WHY was it hidden? (commit message + any linked
  discussion in plans/ or docs/).
- Memory note from the project: hidden-not-deleted was deliberate, "pending
  rework".
- New surface landed since planning that Option A must now consider: 帳本
  (books) scoping — accounts carry `bookId`; a re-enabled DCA tab must state
  how recurring investments scope under the book switcher (`bookScope.ts`).
  **OPERATOR DECIDED (2026-07-17, both directions confirmed)**: DCA rules
  follow their target account's book — 公司帳 view never shows 個人帳 rules
  AND 個人帳 view never shows 公司帳 rules (反之亦然, operator's words).
  Precedent to cite in
  the decision doc: `DashboardRoute.tsx`'s `upcoming` memo already filters
  recurring CASH rules by `switcherAccountIds.has(r.accountId)`; recurring
  INVESTMENT rules adopt the same rule. This question is closed — the doc
  records it, doesn't re-ask.

## The deliverable — `docs/dca-decision.md` containing:

1. **What exists** (1 page max): data model, posting semantics (does it
   auto-create investment records or only remind? — read the posting code
   and say definitively), UI surfaces, test coverage, sync participation.
2. **Why it was hidden**: reconstruct from `6b479416` + surrounding commits.
   If the reason isn't recoverable, say so.
3. **Option A — Rework & re-enable**: what "finalizing the workflow" needs.
   Ground it in the code: known semantic questions to settle — by-amount vs
   by-shares (定額 vs 定股) both in the type?; reminder-only vs auto-post
   (compare with `postDueRecurringTransactions`' auto-post model for
   cash-flow); market-closed/price-unknown day handling; fee auto-fill
   interaction (plan 118's fix); TW fractional-share reality. Coarse effort
   per open question.
4. **Option B — Retire**: what deletion touches (files, schema/sync
   ramifications of dropping an entity type — tombstones? migrations?),
   README/ROADMAP cleanup, and what user value is lost (search GitHub issues
   if any; else note no signal).
5. **Recommendation**: pick one, one paragraph, based on evidence (e.g. if
   the posting path is 90% sound and the blocker was one semantic question,
   say rework; if the feature fights the local-first model, say retire).
   The OPERATOR decides; the document argues.
6. **If A: a plan-ready worklist** (numbered, effort-tagged) that a future
   `/improve plan` invocation can turn into executor plans.

## Commands

Read-only: `git log`/`git show` as above; `npm test -- recurring-investments`
(to confirm the suite is green today — expected: pass).

## Scope

**In scope**: `docs/dca-decision.md` (new file — the ONLY file this plan
creates/modifies besides the plans/README.md status row).
**Out of scope**: ANY src/ change; un-hiding the tab; README edits (plan 139).

## Done criteria

- [ ] `docs/dca-decision.md` exists with all six sections
- [ ] Every claim about the code cites file:line or a commit hash
- [ ] The auto-post vs reminder question is answered from code, not guessed
- [ ] `plans/README.md` updated: status + "awaiting operator decision"

## STOP conditions

- `git show 6b479416` reveals an explicit operator decision already made
  (e.g. "retire after X") — report it; the spike may be moot.

## Maintenance notes

- Whichever option is chosen, plan 139's README fix stands (feature is
  hidden today).
- The decision doc should be linked from ROADMAP's DCA line once written.
