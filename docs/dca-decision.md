# DCA (定期定額/定股) — finish-or-retire decision

> Spike for plan `142`. Reconciled against `main @ 1f6d5ec9` (2026-07-17) and
> re-verified live against `feat/ai-dca-decision-spike @ 5663f098` on
> 2026-07-18. `src/data/repositories.ts` grew ~322 lines between those two
> points (unrelated work), so line numbers below were re-located at the
> current HEAD; `InvestmentsRoute.tsx` and `RecurringInvestmentsTab.tsx` were
> untouched in that window (confirmed via
> `git diff --stat 1f6d5ec9..HEAD -- src/routes/RecurringInvestmentsTab.tsx src/routes/InvestmentsRoute.tsx src/data/repositories.ts`
> — only `repositories.ts` shows a diff).
>
> **STOP condition check**: the plan says to stop if `git show 6b479416`
> reveals an explicit operator decision to retire. It does not — the commit
> message is "hide DCA (定期定額) feature... until it's finalised... stay
> intact for re-enabling later." That is a pause, not a retirement decision.
> **STOP did not fire; this spike proceeds.**

## 1. What exists

**Data model** (`src/domain/types.ts:340–373`): `RecurringInvestment` is "the
investing counterpart of `RecurringTransaction`" (doc comment,
`types.ts:347–352`). Both by-amount and by-shares modes are already in the
type today — `RecurringInvestmentMode = "fixedAmount" | "fixedShares"`
(`types.ts:340`), labelled 定期定額 / 定期定股 (`types.ts:342–345`). Fields:
`accountId` (settlement/cash account), `ticker`, `mode`, `amount` (fixedAmount
periods), `quantity` (fixedShares periods), `price` (manually-entered
reference price), `fee`, `frequency`/`dayOfMonth`/`nextRunDate`, `isActive`,
`note`.

**Posting semantics — answered definitively from code, not guessed:** DCA is
**reminder + manual one-tap confirm, not auto-post.** Evidence:

- The type's own doc comment states the model explicitly: *""Post" materializes
  a buy `InvestmentRecord` and the matching cash settlement (交割款) drawn from
  `accountId`. Like recurring ledger rules it is surfaced as a reminder;
  posting is a manual one-tap so the user can confirm the reference price
  first.*" (`src/domain/types.ts:347–352`)
- UI copy confirms it: the empty state reads "設定定期定額或定期定股，到期時會
  在總覽與投資頁**提醒你**補交割款" (`src/routes/RecurringInvestmentsTab.tsx:159`)
  and the active/inactive checkbox is literally labelled "啟用（**顯示提醒**）"
  (`RecurringInvestmentsTab.tsx:325`) — not "啟用（自動記帳）".
- The action is a discrete button per row, "記錄本期投入" (record this
  period's investment), wired to `post()` → `postRule.mutateAsync(rule.id)`
  (`RecurringInvestmentsTab.tsx:114–121, 188`), calling repository method
  `postRecurringInvestment(id)`.
- `postRecurringInvestment` is **not** scheduler-driven. Contrast with the
  cash-flow analog `postDueRecurringTransactions(today)`
  (`src/data/repositories.ts:392, 1837, 3900`; wired to run automatically in
  `src/data/hooks.ts:160` on every data load) — there is **no** equivalent
  `postDueRecurringInvestments` anywhere in the codebase (`grep -rn
  "postDueRecurring" src/` finds only the cash-flow variant, in
  `repositories.recurring.test.ts` and the two hits above). Investment rules
  never post themselves; a human must open the tab and tap the checkmark.
- Implementation of the manual post
  (`src/data/repositories.ts:1915–1924` browser repo,
  `:3982–3996` SQLite repo) calls `createInvestmentRecord(recurringInvestmentToDraft(rule))`
  then advances `nextRunDate` — one record per tap, never batched, never
  time-triggered.
- `recurringInvestmentToDraft` (`repositories.ts:6479–6499`) derives the
  missing side purely from the rule's **stored, manually-typed** `price`
  field: `quantity = amount / price` for fixedAmount mode, and **throws** ("請
  先設定參考價格與金額／股數…") if `price` or the derived `quantity` is not
  positive. There is no live-quote lookup at post time — the reference price
  the user typed when creating/editing the rule (or last edited) is what gets
  used, however stale.

**UI surfaces**: `RecurringInvestmentsTab.tsx` (349 lines) — list + create/edit
drawer (`ModalShell`, variant `drawer`) + per-row post/edit/delete actions. It
is fully COSS-UI migrated (`Badge`, `Button`, `Card` from `components/coss/*`)
and was touched as recently as commit `6e539c16` (shared `ModalCloseButton`
refactor) and `e943963b` (timezone seeding fix) — **it is actively
style-maintained despite being unreachable**, confirming the memory note
("hidden-not-deleted... pending rework").

**Reachability today**: the tab option was stripped from the visible tab list
(`InvestmentsRoute.tsx:482–486` only renders `portfolio` / `transactions` /
`analytics`) but the render branch survives dead: `{tab === "recurring" ?
<RecurringInvestmentsTab /> : null}` at `InvestmentsRoute.tsx:552`, and the
`tab` state/search-param type still includes `"recurring"`
(`InvestmentsRoute.tsx:64,68,74`) — so the component is one router-state hack
away from reachable, but no UI control reaches it. The comment documenting
the hide, `InvestmentsRoute.tsx:478–481`, matches the plan's "Current state"
excerpt verbatim.

**Test coverage**: `src/data/repositories.recurring-investments.test.ts` — 8
tests, run via `describeEachRepo` (both browser and SQLite repos), all
passing today: `npm test -- recurring-investments` → **8 passed (8), 1 file,
336ms** (confirmed 2026-07-18 on this branch).

**Sync participation — DCA rows fully participate**: `recurringInvestment` is
a first-class `SyncEntity` (`src/domain/sync.ts:24`, part of the 11-entity
union), mapped from `recurringInvestments` in `SyncSource`
(`sync.ts:78,92`), and accepted on pull (`VALID_ENTITIES` set,
`src/features/connect/sync/pull.ts:194`). It also has a conflict-summary
label "定期定額" (`src/features/connect/sync/conflictSummary.ts:14`) and its
own normalization branch in the generic upsert path
(`repositories.ts:5640`, `case "recurringInvestment"`) plus an
`isActive` boolean coercion (`if (entity === "recurringInvestment")
payload.isActive = Boolean(payload.isActive)`). `SYNC_SCHEMA_VERSION` is
still `1` (`sync.ts:6`) — no entity type has ever been added to or removed
from this union since sync shipped, so there is **no established precedent**
in this codebase for retiring a synced entity type.

**Local backup participation**: `src/features/local-backup/backupDiff.ts:34`
diffs `recurringInvestments` under the label "週期投資" — this was added
*after* plan 142 was originally planned (roadmap item 5.1), so any retirement
must also touch the backup/restore snapshot shape (`RepositorySnapshot`,
plan 192's precedent for what a snapshot-shape change costs).

**Storage**: SQLite table `recurring_investments`, created by migration id 4,
"Recurring investment plans (定期定額 / 定期定股)"
(`src/data/migrations.ts:209–235`). Demo/seed data currently ships an empty
array (`src/data/demoData.ts:539`, `recurringInvestments: []`) — no demo rule
is seeded, so there is nothing showcasing the feature even in the demo
build.

## 2. Why it was hidden

Commit `6b479416` ("feat(investments): hide DCA (定期定額) feature; rename
analytics Total→All", 2026-06-15) is a 2-file, 37-line diff
(`InvestmentsRoute.tsx` −25/+12, `InvestmentsAnalyticsTab.tsx` unrelated
rename). It removed three things in one motion:

1. The `定期定額` tab entry from the page-tabs array.
2. The dashboard-adjacent "due" reminder banner inside `InvestmentsRoute`
   itself (`dueRecurringCount` memo + the `CossCard` banner that said "有 N
   個定期定額計畫待投入，記得備妥交割款").
3. Left everything else — the component, the repository methods, the data,
   the tests — untouched, and added the comment (still present today,
   `InvestmentsRoute.tsx:478–481`) explaining the hide is *"until the
   workflow is finalised."*

The commit message and diff give **no specific technical reason** (no bug
reference, no failing test, no linked plan/doc). It reads as a scope/UX
call, not a defect fix — consistent with the ROADMAP line "DCA
重做（已暫時隱藏）... 待方向定案後重做再開" (rework, direction pending) and the
project memory note ("hidden not deleted, pending rework, deliberate").
Nothing in the commit or its immediate neighbors in `git log --oneline --all
-- src/routes/RecurringInvestmentsTab.tsx` (checked back to the feature's
introduction at `8b24abbc`, "feat(investments): recurring investment plans
(定期定額 / 定期定股)") names an open question. **The specific "what wasn't
finalised" reason is not recoverable from git history** — the operator's own
words are the only record, and per the plan's context those words are "重做
— 待方向定案後重做再開" (rework pending a direction decision), i.e. the
"workflow" gap is the open semantic questions enumerated in §3 below (mainly:
should posting stay 100% manual, and how should price/fractional-share
edge cases be handled), not a specific bug.

## 3. Option A — Rework & re-enable

The posting *mechanism* (manual one-tap, `createInvestmentRecord` reuse) is
sound and tested. What "finalizing the workflow" concretely needs, in order
of what blocks re-enabling vs. what's just polish:

1. **Reminder vs. auto-post — already answered, not open.** §1 shows the
   current code is reminder + manual-post, matching the type doc's stated
   intent. This is not a design question left to resolve; it's already the
   implemented model. *(If the operator instead wants full
   `postDueRecurringTransactions`-style auto-post for investments, that is a
   genuinely new feature, not "finishing" the existing one — flag as a
   separate decision, not bundled into re-enable. Effort: M, new code path +
   new tests + a "what if the market's closed / price is stale" story that
   doesn't exist for cash rules.)* **Effort to just re-enable as-is: none**
   (semantics already match the doc).
2. **By-amount vs. by-shares — already answered, not open.** Both modes are
   already in the type and the UI (`RecurringInvestmentMode`,
   `RecurringInvestmentsTab.tsx:252–270` mode toggle). **Effort: none.**
3. **Market-closed / price-unknown day handling — a real, unresolved gap.**
   `price` is a static number the user types once at rule creation/edit
   (`RecurringInvestmentsTab.tsx:282–284`, "參考價格") with no live-quote
   refresh at post time; `recurringInvestmentToDraft` throws only if price is
   literally 0/unset (`repositories.ts:6484–6486`), not if it's stale by
   weeks. A user who set up a rule in January and posts it in July gets
   January's price silently used for cost-basis unless they remember to edit
   the rule first. This is the one open question the current implementation
   genuinely doesn't answer. **Effort: S–M** — cheapest fix is a "refresh
   from latest quote" affordance in the post flow (reuse
   `useRefreshQuotes`/`quotes` data already loaded in `InvestmentsRoute`);
   more thorough is warning the user when `price` predates `nextRunDate` by
   more than N days.
4. **TW fractional-share reality.** `quantity = amount / price` for
   fixedAmount mode (`repositories.ts:6482–6483`) is not rounded to a lot
   size; Taiwan brokers commonly require whole-share or 1000-share lots for
   normal orders (odd-lot/零股 trading exists but has different fee
   schedules). The type and math don't distinguish. **Effort: S** — likely
   just a rounding note or an odd-lot flag; needs a product call on whether
   Northstar should round or just record the mathematically-implied
   fractional share (which is arguably *more* correct for cost-basis
   tracking even if the real-world order was rounded).
5. **Fee auto-fill interaction (plan 118).** Plan 118
   (`plans/118-fee-autofill-preserves-stored-fee.md`) fixed
   `InvestmentsAddSheet.tsx`'s auto-fill from silently overwriting a stored
   fee on edit. `RecurringInvestmentsTab`'s own fee field
   (`RecurringInvestmentsTab.tsx:288–289`) is a plain manual number input
   with **no auto-fill logic at all** — so plan 118's specific bug doesn't
   reproduce here, but `postRecurringInvestment` hands its `fee` straight to
   `createInvestmentRecord`, which under the hood is the same code path
   `InvestmentsAddSheet` uses. Re-enabling should add a regression test that
   posting a rule doesn't get its fee clobbered by that sheet's auto-fill
   effect if the post flow ever routes through the add-sheet UI instead of
   calling the repository directly (today it doesn't — `post()` calls the
   mutation directly, bypassing the sheet — so currently safe, but worth
   locking down explicitly). **Effort: S** (one test, no code change likely
   needed).
6. **帳本 (books) scoping — operator-decided 2026-07-17, not open.** DCA
   rules follow their target account's book: 公司帳 view never shows 個人帳
   rules and vice versa (operator's words, "反之亦然"). Precedent:
   `DashboardRoute.tsx`'s `upcoming` memo already does exactly this for cash
   recurring rules — `.filter((r) => r.isActive && r.nextRunDate >= today &&
   r.nextRunDate <= horizon && switcherAccountIds.has(r.accountId))`
   (`DashboardRoute.tsx:798–806`, `switcherAccountIds` built at
   `DashboardRoute.tsx:219` via `bookAccountIdSet(accountRows,
   activeBookId)`). Re-enabling `RecurringInvestmentsTab` needs the same
   `switcherAccountIds.has(r.accountId)` filter applied to its `rules` list
   and to any dashboard-level due-count/reminder that gets restored.
   **Effort: S** — mechanical, one filter line, following an in-repo
   pattern exactly.
7. **Dashboard reminder card** — commit `6b479416` also removed a
   dashboard-level reminder (not just the `InvestmentsRoute` banner);
   re-enabling "the workflow" likely means restoring that surface too,
   scoped per (6). **Effort: S**, mostly UI wiring using the same
   `switcherAccountIds` pattern.

**Bottom line for Option A**: of the "known semantic questions," two
(reminder-vs-auto-post, by-amount-vs-by-shares) turn out to be **already
resolved in the shipped code** — the spike just needed to read the code to
confirm it. The real open item is stale-price handling at post time (#3),
plus a books-scoping mechanical addition (#6, already operator-decided) and
minor hardening (#4, #5, #7). None of this is architecturally hard; it's a
short, well-scoped punch list, not a redesign.

## 4. Option B — Retire

**What deletion touches:**

- Files: `src/routes/RecurringInvestmentsTab.tsx` (349 lines, delete
  outright); its import/usage in `InvestmentsRoute.tsx` (`:54` import,
  `:552` render branch, `"recurring"` from the `tab` union at `:64,68,74`).
- Repository surface: `createRecurringInvestment`,
  `updateRecurringInvestment`, `deleteRecurringInvestment`,
  `postRecurringInvestment`, `listRecurringInvestments` — both browser
  (`repositories.ts:1888–1924`) and SQLite (`:3956–3996`) implementations,
  plus the interface declarations (`:392,398` area) and the
  `RecurringInvestmentDraft` type, `createRecurringInvestmentRow`
  (`:6458` area) and `recurringInvestmentToDraft` (`:6479–6499`) helpers.
- **Schema/sync ramifications — the hard part.** `recurringInvestment` is a
  live `SyncEntity` (§1). Dropping it isn't just deleting UI code:
  - Existing synced devices/relay history may hold `recurringInvestment`
    envelopes. Removing the entity from `VALID_ENTITIES`
    (`pull.ts:194`) means a device that still has local rows (created before
    retirement, never posted/deleted) would either (a) silently stop syncing
    them — data divergence across a user's devices — or (b) need an explicit
    migration that tombstones/deletes all local `recurring_investments` rows
    and stops emitting them to the outbox.
  - No prior precedent exists for retiring a synced entity in this codebase
    (`SYNC_SCHEMA_VERSION` has never been bumped past `1`). This would be
    the first one — meaning the migration path has to be designed, not just
    copied.
  - The SQLite table (migration id 4,
    `src/data/migrations.ts:209–235`) — this project's migrations are
    additive-only historically; the safe move is *not* to drop the table
    (breaks anyone re-running migrations from scratch on an old backup) but
    to stop reading/writing it and optionally add a new migration that
    clears rows, consistent with "don't rewrite migration history."
  - Local backup: `backupDiff.ts:34`'s "週期投資" row and the
    `RepositorySnapshot` shape (plan 192 precedent) need updating so
    restore doesn't try to rehydrate a retired entity.
- README/ROADMAP cleanup: ROADMAP's line 131 (定期定額/定股（DCA）重做...)
  would become a "retired" note instead of "rework pending"; README has no
  current DCA mention to clean up (`grep` found none — plan 139's README fix
  already appears to have landed or DCA was never (re)added there).
- **What user value is lost**: no GitHub issue tracker signal was found for
  or against DCA — this repository has no `.github/ISSUE_TEMPLATE` activity
  visible locally and this spike did not have network access to check a
  remote issue tracker, so **no external demand signal either way**; note
  this as an open unknown rather than a "no demand" conclusion. Internally,
  DCA is a commonly-requested personal-finance feature category (automating
  a periodic buy plan) and Northstar already carries all the supporting
  infrastructure (account linkage, sync, backup) for it — retiring throws
  away a feature that's ~90% built, tested, and already priced into the
  sync/backup schemas whether or not the UI is reachable.

## 5. Recommendation

**Rework & re-enable (Option A).** The evidence points this way: the posting
path is not merely "mostly sound," it is *fully implemented and tested*
end-to-end (8/8 tests passing on both storage backends), the two semantic
questions the plan flagged as open (auto-post-vs-reminder, amount-vs-shares)
turn out to already be resolved correctly in the shipped code, and the
remaining gap (stale reference price at post time) is a small, well-bounded
UI addition, not an architecture problem. Meanwhile Option B's true cost is
not the UI deletion — it's being the **first-ever retirement of a synced
entity type** in a codebase with zero precedent for that migration, touching
sync (`pull.ts`, `domain/sync.ts`), local backup (`backupDiff.ts`,
`RepositorySnapshot`), and SQLite migrations simultaneously, to remove a
feature that isn't fighting the local-first model (it's a local computation
+ a manual confirm tap, no cloud dependency) and for which no "please remove
this" signal exists. The operator decides; the code says finish it.

## 6. If A: plan-ready worklist

Numbered, effort-tagged, ready for a future `/improve plan` pass:

1. **[S] Books-scoping filter.** Apply `switcherAccountIds.has(r.accountId)`
   (pattern: `DashboardRoute.tsx:798–806`) to `RecurringInvestmentsTab`'s
   `rules` list and any restored dashboard due-count. Operator-decided
   semantics already recorded in §3.6 above.
2. **[S] Re-add the tab.** Restore the `定期定額` entry in
   `InvestmentsRoute.tsx`'s page-tabs array (`:482–486`) — the render branch
   (`:552`) and `tab` union (`:64,68,74`) are already wired, this is a
   1-line array addition plus removing/updating the hide comment.
3. **[S] Restore the dashboard/investments due-reminder banner**, scoped per
   item 1 (books-aware), replacing what `6b479416` removed.
4. **[S–M] Stale reference-price handling at post time** — surface the
   loaded `quotes`/`dailyPrices` data (already fetched in
   `InvestmentsRoute`) in the post flow so the user can refresh `price`
   before confirming, and/or warn when `price` predates `nextRunDate` by more
   than a threshold. This is the one real open semantic gap (§3.3).
5. **[S] TW fractional-share / lot-size decision** — product call: round
   `quantity` for fixedAmount mode, or leave fractional (arguably more
   correct for cost-basis)? Implement whichever is decided in
   `recurringInvestmentToDraft` (`repositories.ts:6479–6499`). (§3.4)
6. **[S] Lock down the fee-autofill boundary** with a regression test
   confirming `postRecurringInvestment` never routes through
   `InvestmentsAddSheet`'s auto-fill effect (plan 118's bug class). No code
   change expected, just a test. (§3.5)
7. **[S] README/ROADMAP** — flip ROADMAP's 定期定額/定股 line from "重做（已
   暫時隱藏）" to shipped once re-enabled; confirm README still doesn't need
   a DCA mention re-added (plan 139 territory, don't duplicate here).
8. **[XS] Demo data** — optionally seed one `recurringInvestments` row in
   `src/data/demoData.ts:539` so the re-enabled tab isn't empty in the demo
   build.

Total: no item above S–M; nothing here re-opens the two "already resolved"
questions from §3. This is a finishing pass, not a redesign.
