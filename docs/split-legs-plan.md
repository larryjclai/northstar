# Split-legs data-model spike — one schema for 分帳 + 多類別

> **Doc-only design spike (Plan 176).** Deliverable is this decision document; zero code
> changes. It gates any future 分帳/多類別 build plan — those plans must cite this file.
> Status: **proposal for operator decision**, not an approved build.

## Why this exists

`ROADMAP.md` 規劃中 lists two features that both decompose one transaction into parts:

- **分帳** — 記錄一筆支出中誰佔多少（選擇性建立應收/應付）。 (`ROADMAP.md:135`)
- **多類別** — 同一時間地點的一筆消費可拆多類別（如家樂福同時買傢俱與食物），群組式記帳。 (`ROADMAP.md:136`)

The codebase has already invented **four** bespoke "linked record group" mechanisms
(fee-leg, transfer group, `installmentGroupId`, `dripGroupId`). Building 分帳 and 多類別
separately would predictably mint mechanisms #5 and #6, each re-deriving its own creation,
delete-cascade, sync-partial-arrival, and reporting rules. One split-legs decision now —
while the alpha explicitly reserves the right to break the schema before GA
(`README`/`AGENTS.md`) — is far cheaper than converging six mechanisms after GA.

**Key finding up front:** the "split" model this spike proposes *already exists in embryo*.
`groupClassifier.ts:3` enumerates a `"split"` group kind, and the fee-leg path
(`repositories.ts:745–764`) already writes a second ledger row that shares a `groupId` and
carries **its own `category`** (`手續費`). 多類別 is that pattern generalized to N
user-chosen categories; 分帳 is that pattern where a leg additionally carries a counterparty
and (optionally) spawns an 應收/應付 row via the existing 代墊 (`counterAccountId`) machinery.

## 1. Existing group mechanisms (mapped)

All four hang off `LedgerTransaction`/`InvestmentRecord`, both of which extend `SyncFields`
(id/revision/createdAt/updatedAt/deletedAt) and sync per-record.

| Mechanism | Linkage field(s) | Creation path | Delete / edit cascade | Sync behavior | Reporting treatment |
|---|---|---|---|---|---|
| **Fee-leg** (income/transfer fee as 2nd row) | `groupId` (`types.ts:124`) | `createLedgerTransaction` writes main row + a `手續費` expense row sharing one `groupId` when `feeAmount>0` (`repositories.ts:745–764`; SQLite twin `2291–2309`) | `deleteLedgerTransaction` soft-deletes **every row with the same `groupId`** (`repositories.ts:797–802`; SQLite `2348–2351`). No cascade on edit — `updateLedgerTransaction` edits only the one row and passes `groupId` through (`775`) | Per-record LWW; the two rows are independent envelopes. No group-atomic apply. | Fee row is a plain `expense` with `category:手續費` → counted on its own in `categoryPeriodSpend` (`categorySpend.ts:45–58`). Classifier calls a same-account multi-row group `"split"` (`groupClassifier.ts:20`) |
| **Transfer group** | `groupId` (`transferBuilder.ts:48`) | `buildTransfer` returns 2 rows (−source / +dest) sharing a `groupId`; `createTransfer` inserts them (`repositories.ts:895–930`) | Same `groupId` cascade delete as fee-leg (`797–802`) | Per-record LWW → **can arrive partially**. This is the one mechanism with explicit partial-arrival detection: `incompleteTransferGroupIds` flags a `groupId` whose `entryType==="transfer"` legs ≠ 2 (`ledgerTrust.ts:151–165`) | Excluded from income/expense via `isNeutralLedgerRow` (`entryType==="transfer"`, `ledgerTrust.ts:22–24`) |
| **Installments** (信用卡分期) | `installmentGroupId` + `installmentIndex`/`installmentTotal` (`types.ts:132–136`; `installments.ts`) | `createInstallmentPlan` builds an N-period schedule (`buildInstallmentSchedule`, `installments.ts:44–59`) and pushes N rows sharing `installmentGroupId`, each with `groupId:null` (`repositories.ts:807–823`) | `deleteInstallmentPlan` soft-deletes rows by `installmentGroupId`, optionally scoped `fromIndex` ("this and later periods") — rows are **individually** deletable (`repositories.ts:828–836`) | Per-record LWW; periods independent. No group-atomic apply; no partial-arrival guard (each period is a normal standalone expense, so a missing period simply doesn't post — self-consistent) | Each period is a standalone `expense` counted on its own date/category in `categorySpend` |
| **DRIP** (股息再投入) | `dripGroupId` on `InvestmentRecord` (`types.ts:229`) | `createDividendReinvestment` builds a `cashDividend` + `buy` leg sharing one `dripGroupId`; each may also spawn a linked ledger row via `linkedLedgerTransactionId` (`repositories.ts:1047–1073`) | `deleteInvestmentRecord` soft-deletes **all** records with the same `dripGroupId` and their linked ledger rows (`repositories.ts:1123–1136`; SQLite `2679–2684`) | Per-record LWW → can arrive partially; **no dedicated partial-arrival guard** for a half-arrived DRIP pair (see open risk) | Both legs feed moving-average cost / XIRR as normal investment records |

**Common shape:** a shared string id (`groupId` / `installmentGroupId` / `dripGroupId`),
plus a delete-cascade that keys off that id, plus per-record LWW sync with **no group-atomic
transaction**. Only transfers bother to detect partial arrival. Edits are per-row (no group
re-balancing anywhere).

## 2. Proposed unified model — parent + legs

### Shape

Reuse the existing `groupId` column on `ledger_transactions` (no new table) plus one small
discriminator, so a "split" is N sibling ledger rows sharing a `groupId`:

- **No separate legs table.** Each leg *is* a `LedgerTransaction` row (same as fee-leg and
  installments already do). This inherits sync, CSV, reconciliation, and delete-cascade for
  free and keeps `資產 − 負債 = 淨值` trivially true, because every leg is already a real
  signed posting against an account.
- Add a nullable `legKind` discriminator to `LedgerTransaction`:
  `"category" | "share"` (or leave null for legacy/fee/transfer legs). `"category"` = a 多類別
  slice; `"share"` = a 分帳 participant's portion.
- A 分帳 `"share"` leg that belongs to someone else reuses the **existing 代墊 machinery**:
  set `counterAccountId` so the row is a net-zero pass-through that spawns an 應收/應付 balance
  exactly as documented at `types.ts:92–107`. No new AR/AP record shape is invented.
- **"Parent"** is not a distinct row type. The group's shared header (total, merchant, date,
  account) lives on the leg rows themselves (they already carry `merchant`/`date`/`accountId`),
  and the aggregate is derived by grouping on `groupId` — mirroring how `classifyLedgerGroup`
  already reconstructs a group from its rows (`groupClassifier.ts:5–25`). Optionally the first
  leg is treated as the "primary" for display.

> A pure alternative — a real parent row (`amount = total`, `legKind:"parent"`) with child
> legs summing to it — is viable but forces every consumer to special-case "don't
> double-count the parent." Sibling-legs-only avoids that and matches current code.

### Invariants

- **Legs sum to the group total.** Enforced at **creation** in the repository (a
  `buildSplit(...)` helper analogous to `buildInstallmentSchedule`, which already guarantees
  `periods` sum exactly to the total by folding the rounding remainder into the first period —
  `installments.ts:52–53`). Re-checked in `assertLedgerInvariants` on write.
- **Reconciliation identity holds automatically** — every leg is a signed account posting, so
  `recompute()` balances accounts with zero special-casing (same as today's fee-leg).
- **Neutrality of 分帳 shares:** a `share` leg with `counterAccountId` set is already excluded
  from income/expense by `isNeutralLedgerRow` (`ledgerTrust.ts:22–24`) — so someone else's
  portion never inflates the user's own spend. The user's own portion is a normal expense leg.

### Edit / delete cascades

- **Delete:** reuse the existing `groupId` cascade (`repositories.ts:797–802`) — deleting any
  leg tombstones the whole split. (Or, following installments, allow single-leg delete + a
  re-balance; recommend group-atomic delete for v1 to match fee/transfer semantics.)
- **Edit:** today edits are per-row. A split needs a group-aware edit that re-runs the
  sum-to-total invariant. This is the one genuinely new repository method (`updateSplit`).

### Sync semantics under LWW + partial arrival

- Legs sync as independent envelopes under per-record LWW keyed on
  `(entity, id, revision, updatedAt)` (`pull.ts:1–9,154–157`). **A split can therefore arrive
  partially**, exactly like transfers do today.
- Reuse the transfer precedent: extend the `incompleteTransferGroupIds` idea in
  `ledgerTrust.ts:151–165` to a general `incompleteSplitGroupIds` (a `groupId` whose visible
  legs don't sum to the recorded total, or whose leg count is short). Surface it in the same
  data-health report rather than blocking. **No group-atomic sync is proposed** — that would
  contradict the whole per-record model and is out of scope.

### Backward migration

**None required for existing plain transactions.** A plain transaction is simply a group of
one — `classifyLedgerGroup` already returns `"singleton"` for a row with no `groupId`
(`groupClassifier.ts:8`). The only schema delta is an additive nullable `leg_kind` column
(pattern already used for `installment_group_id` etc., all `create table if not exists` +
`ensureSqliteColumn` — `migrations.ts`, latest migration `id:4`). Legacy rows read `null`.

### Consumer impact (every consumer from Current-state)

| Consumer | Entry point | Impact |
|---|---|---|
| Category spend / budgets | `categorySpend.ts:32` `categoryPeriodSpend` | **Unchanged** — already counts each expense row by its own `category`; N category legs just appear as N rows. Fee-leg proves this works today. |
| Budget rollover | `budgetRollover.ts` | **Unchanged** — consumes category-spend output. |
| Cash-flow grouping | `dashboardSummary.ts` (per-account contributions `207–215`) | **Unchanged** for `category` legs; `share` legs already handled via the `counterAccountId` branch (`212–214`). |
| Dashboard summary / net worth | `dashboardSummary.ts`; `northstarMetrics.ts:73,116` | **Unchanged** — `isNeutralLedgerRow` already excludes 代墊 pass-throughs and transfers. |
| CSV export/import | `data/csv.ts:32` | **Needs-change (small):** export unaffected (legs are rows); import currently rejects `transfer` rows (`csv.ts:110`) and has no split concept — decide whether to export/re-import `groupId`/`legKind` or flatten. Recommend: export legs flat, no split re-import in v1. |
| Reconciliation `資產 − 負債 = 淨值` | `recompute()` / `recalculationReport` (`ledgerTrust.ts:145–169`) | **Unchanged** — legs are real postings; add split legs to the partial-group check alongside transfers. |
| Sync | `pull.ts`, `push.ts` | **Needs-change (small):** add `incompleteSplitGroupIds` data-health surfacing; no change to the LWW core. |
| Group classifier | `groupClassifier.ts` | **Minor:** `"split"` kind already exists; may refine to read `legKind`. |

## 3. Alternatives, recommendation, open questions

### Alternative A — split the two features apart
Implement **多類別** as pure category-split legs (the parent+legs model above, `category`
legs only) but implement **分帳** **entirely on existing 應收/應付 (`counterAccountId`) rows**
with no leg/`legKind` schema at all — each participant's share is just a standalone 代墊 row.

- **Benefit:** zero schema change for 分帳; 分帳 ships purely as a UI over machinery that
  already exists and is already tested (`account.test.ts`, receivable paths).
- **Cost:** the two features drift into two mental models again (the exact failure this spike
  exists to prevent); a 消費 that is *both* multi-category *and* split among people has no
  single grouping; you re-derive delete/edit/partial-arrival semantics twice. Honest verdict:
  cheaper this quarter, more expensive at the first "split a Costco receipt across people
  **and** categories" request.

### Alternative B — real parent row
A `legKind:"parent"` row carrying the total, with children summing to it. Cleaner mental
model and a natural home for the group total, but every existing consumer must learn to skip
the parent to avoid double-counting — net more edits than sibling-legs-only.

### Recommendation (≤5 sentences)
Adopt the **sibling parent+legs model on the existing `groupId` column** with an additive
nullable `legKind`, because it generalizes the fee-leg pattern the codebase already ships,
tests, syncs, and reconciles correctly. 多類別 becomes N `category` legs; 分帳 becomes `share`
legs that reuse the 代墊 `counterAccountId` machinery for optional 應收/應付 — one grouping
serves both, including the combined case. It needs **no data migration** (plain rows are
singletons) and touches consumers minimally (most are unchanged because they already treat
each row independently). The only genuinely new code is a `buildSplit` sum-to-total helper, a
group-aware `updateSplit`, and extending the transfer partial-arrival check to splits. Prefer
this over Alternative A (which re-splits the mental model) and Alternative B (which forces
double-count guards everywhere).

### Operator questions (each with a default)
1. **Does a leg get its own date?** *Default: no* — legs inherit the group date (one purchase,
   one moment); installments are the exception and stay their own mechanism.
2. **Can splits nest** (a share leg that is itself multi-category)? *Default: no for v1* — flat
   groups only; revisit if the combined Costco case demands it.
3. **Group-atomic delete or per-leg delete?** *Default: group-atomic* (match fee/transfer),
   with per-leg edit that re-balances to total.
4. **UI entry point?** *Default:* a "拆分" affordance in the existing ledger add/edit sheet
   (`InvestmentsAddSheet.tsx` is the investment analogue) — reuse, don't build a new route.
5. **CSV round-trip for splits?** *Default:* export legs flat, no split re-import in v1.
6. **Does 分帳 always create 應收/應付, or optionally?** Roadmap says 選擇性 — *default:* a
   per-share toggle; a share with no counterparty account is just an informational note.

### Phased build sketch
| Phase | Scope | Size | Tests to extend |
|---|---|---|---|
| P1 | Schema: additive nullable `leg_kind` column + `buildSplit` sum-to-total helper | **S** | `repositories.migration.test.ts`, new `installments`-style unit test |
| P2 | Repository: `createSplit`/`updateSplit`/delete cascade + `assertLedgerInvariants` sum check | **M** | `repositories.ledger-fee.test.ts` (sibling pattern), new `repositories.split.test.ts` |
| P3 | Sync: `incompleteSplitGroupIds` in the data-health report | **S** | `pull.test.ts`, `repositories.sync.test.ts`, `ledgerTrust.test.ts` |
| P4 | One UI entry (拆分 in the ledger sheet) + 分帳 應收/應付 toggle wiring | **M** | e2e ledger flow |
| P5 | Reports/CSV: confirm category-spend/net-worth unchanged; decide CSV leg export | **S** | `categorySpend.test.ts`, `csv` tests, `dashboardSummary.test.ts` |

## Open risks
- **Partial sync arrival for linked records (DRIP especially).** Confirmed from `pull.ts:1–9,
  154–157`: sync is strictly per-record LWW keyed on `(entity,id,revision,updatedAt)` with no
  group-atomic apply. Only **transfers** detect a half-arrived group
  (`incompleteTransferGroupIds`, `ledgerTrust.ts:151–165`). **Fee-leg, installments, and DRIP
  have no equivalent guard** — a device that pulls one leg of a DRIP pair (or one fee-leg)
  before the other transiently shows an unbalanced/half-existing group until the sibling
  arrives. Cost basis / XIRR would be momentarily wrong for a half-arrived DRIP. Any split
  build must add the `incompleteSplitGroupIds` guard *and* the operator should note DRIP is
  currently unguarded. This is a note-and-continue risk, not a blocker; the whole sync model
  is consistently per-record LWW (no contradiction found), so the STOP condition does not fire.

## Maintenance notes
- This doc gates any future 分帳/多類別 build plan; those plans must cite it.
- If the operator rejects the unified model, record the rejection in `plans/README.md`'s
  rejected-findings ledger so it isn't re-proposed.
