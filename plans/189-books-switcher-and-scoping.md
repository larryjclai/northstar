# Plan 189: 帳本 Phase 1b — 側欄帳本切換器、全介面查詢範圍化、帳戶歸屬與每本帳開關

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on.
> Touch only files within scope. If any STOP condition occurs, stop and
> report — do not improvise. Do NOT update `plans/README.md` — the reviewer
> maintains the index.
>
> **Read first**: `docs/ledger-books-plan.md` §1 (the 12-surface scoping
> table — your worklist), §2(a), §5 (switcher placement + toggle
> semantics). It is committed to main.
>
> **Drift check (run first)**:
> `git diff --stat <planned-at SHA>..HEAD -- src/components/AppShell.tsx src/state/uiPreferences.ts src/routes/DashboardRoute.tsx src/routes/CashFlowRoute.tsx`
> Also REQUIRED: plan 188 must be merged (check `grep -n '"book"'
> src/domain/sync.ts` succeeds) — if absent, STOP: dependency not landed.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (touches every money aggregation's inputs; mitigated by 188's characterization test + the shared-filter design below)
- **Depends on**: plans/188-books-foundation.md (MERGED — main @ `fd724031`)
- **Category**: direction (books Phase 1b)
- **Planned at**: commit `fd724031`, 2026-07-13

## 188-provided API (verified at dispatch, main @ `fd724031`)

- `FinanceRepository.listBooks(): Promise<Book[]>` (repositories.ts:262)
- `createBook(input: BookDraft)` / `updateBook(id, input: BookDraft)` (263-264); NO deleteBook
- `BookDraft = Pick<Book, "name" | "kind" | "includeInPersonalNetWorth" | "includeInFireMetrics" | "color">` (repositories.ts:90)
- `Book` (domain/types.ts): `{ name, kind: "personal"|"company", includeInPersonalNetWorth, includeInFireMetrics, color: string|null } & SyncFields`
- `Account.bookId: string` — non-optional, backfilled to default 個人帳, never null at rest
- Default book guaranteed after `initialize()` (kind "personal", name 「個人帳」)
- §1 aggregation entry points still valid: `buildNetWorthBreakdown`/`calculateAvailableCash`/`calculateLiabilities` (dashboardSummary.ts:77/22/41), `goalPace` (goalPace.ts:29), `trailingMonthlyExpense` (northstarMetrics.ts:51), `calculateFireProjection` (fireGoal.ts:41) — all take `Account[]`/row arrays as inputs (scope the inputs, do NOT change signatures)

## Why this matters

With 188 merged, books exist but nothing reads them. This plan makes 帳本
real for the operator: a sidebar switcher (個人帳/公司帳/總帳), every
aggregation scoped to the active book, accounts assignable to books, and
the per-book 計入淨值/計入FIRE toggles. Design contract
(docs/ledger-books-plan.md): 總帳 always shows everything; personal-scoped
FIRE/goal metrics honor the toggles; cross-book transfers must read as
「轉出至公司帳」-style movements, never as income/expense (already
guaranteed by `isNeutralLedgerRow` excluding by entryType — verify, don't
reinvent).

## Current state (verify each at dispatch; planned pre-188 so expect drift ONLY from 188's own additive changes)

- **Active-book state**: `src/state/uiPreferences.ts` — zustand store,
  manually persisted to localStorage under `STORAGE_KEY` (line ~164), with
  existing keys like `holdingsColumns`, `dashboardHiddenCards`. Add
  `activeBookId: string | "all"` (`"all"` = 總帳) following the same
  pattern. NOTE vitest jsdom has no localStorage — existing tests stub it
  per-test (`vi.stubGlobal`, see project convention).
- **Switcher placement**: `src/components/AppShell.tsx` — the Global
  Search trigger div (~line 227–252) is followed by the Quick Add trigger
  (~line 254). The switcher goes between them (design §5), rendering: one
  row per book (dot in `book.color`, name) + a 總帳 pseudo-entry, active
  one highlighted like `ns-nav-link.active`; collapsed-sidebar variant
  mirrors how Search/QuickAdd render icon-only when `collapsed`.
- **The scoping worklist**: docs/ledger-books-plan.md §1's table (12
  surfaces with file:line entry points). Mechanism: derive
  `bookAccountIds: Set<string>` from `accounts` + `activeBookId`, filter
  accounts and ledger rows by membership BEFORE they reach the aggregation
  functions — the same pattern every route already uses for
  `selectedAccount` (e.g. `DashboardRoute.tsx:287` `monthRows` filter,
  `CashFlowRoute.tsx` filters ~911–1036). Do NOT change the domain
  functions' signatures; scope their INPUTS.
- **Shared helper** — create `src/domain/bookScope.ts` with these pure
  functions, and encode the semantics below as tests FIRST (Step 1):
  - `bookAccountIdSet(accounts, activeBookId): Set<string>` — the SWITCHER
    scope. `activeBookId === "all"` → every account id (identity, no
    filtering). Otherwise → ids of accounts whose `bookId === activeBookId`.
  - `scopeRows(rows, accountIdSet): T[]` — keep rows whose `accountId ∈ set`
    (generic over ledger rows / assets / anything with `accountId`).
  - `fireMetricAccountIdSet(accounts, books): Set<string>` — ids of accounts
    belonging to books with `includeInFireMetrics === true`.
  - `personalNetWorthAccountIdSet(accounts, books): Set<string>` — ids of
    accounts belonging to books with `includeInPersonalNetWorth === true`.

  **The two-axis rule (docs/ledger-books-plan.md §5, operator-locked — this
  is the load-bearing semantic; get it exactly right):**
  1. **General views** (net-worth breakdown, cash-flow, investments, budgets,
     annual report) are scoped by the **switcher** via `bookAccountIdSet`.
     Viewing 公司帳 → that book only; viewing 總帳 (`"all"`) → everything.
  2. **FIRE-family metrics** (`calculateFireProjection`, `trailingMonthly*`,
     `coverageRatioPct`, `runwayMonths` in northstarMetrics.ts; `goalPace`)
     are scoped by **`fireMetricAccountIdSet` REGARDLESS of the switcher** —
     they answer "the USER's personal financial independence," which has one
     answer, not one-per-tab. A 公司帳 with `includeInFireMetrics: false`
     (the company default) never feeds these, even while viewing 總帳.
  3. The **北極星 hero KPI — DECIDED (operator, 2026-07-13): follows the
     switcher.** The `netWorth` metric (default hero) is switcher-scoped via
     `bookAccountIdSet` — viewing 公司帳 shows the company book's net worth,
     總帳 shows combined. This matches §1 surface #1's `目前帳本` scope.
     **Critical subtlety the executor must handle**: `firstGoalPct`
     (DashboardRoute.tsx ~347-353, the `fireProgress` metric's calc) and any
     other FIRE-family calc currently reuse the SAME `netWorth` variable.
     Once `netWorth` is switcher-scoped, those FIRE calcs would wrongly move
     with the switcher. They must be recomputed from a SEPARATE
     personal-scoped net worth (`personalNetWorthAccountIdSet` for the FI
     progress figure; `fireMetricAccountIdSet` for runway/coverage inputs) —
     do NOT let `firstGoalPct` read the switcher-scoped `netWorth`.
- **Account assignment UI**: `src/routes/AccountsRoute.tsx` account
  create/edit form gains a 帳本 select (options from `listBooks()`,
  default = active book); a settings surface (帳本管理: create book with
  name/kind/color, edit toggles) — place it where account-adjacent
  management already lives; follow the existing form patterns in
  AccountsRoute (COSS components, zh-TW labels).
- **QuickAdd/EntryDrawer defaults**: `src/components/QuickAdd.tsx` and the
  EntryDrawer account pickers show active-book accounts first (or filter to
  them with a 顯示全部 escape) — design §5; keep it minimal: default-filter
  + escape hatch, no redesign.
- 188 guarantees: every account has `bookId`; `listBooks()` exists; default
  book 「個人帳」 exists.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Install   | `npm install`        | exit 0              |
| Typecheck | `npx tsc --noEmit`   | exit 0              |
| Tests     | `npm test`           | all pass (188's suite + new) |
| Lint      | `npm run lint`       | exit 0              |

## Scope

**In scope**:
- `src/domain/bookScope.ts` (+ `bookScope.test.ts`) — the ONLY new domain logic
- `src/state/uiPreferences.ts` (activeBookId)
- `src/components/AppShell.tsx` (switcher)
- Route files listed in docs/ledger-books-plan.md §1's entry-point column,
  scoping their INPUT rows/accounts (Dashboard, CashFlow, Investments,
  Accounts, Goals/FIRE surfaces, annual report, analytics tab, data-health
  stays 總帳 per §1 #11)
- `src/routes/AccountsRoute.tsx` (帳本 select + 帳本管理 surface)
- `src/components/QuickAdd.tsx` + EntryDrawer (default account filtering)

**Out of scope**:
- Any repository/sync/schema change — 188 finished那層; needing one = STOP.
- Invoice/tax/客戶 anything (Phase 2).
- Sharing (Phase 3/4). No member/key code.
- 總覽 per-book breakdown visualization (§5 mentions labeling 總帳 mode —
  v1: a one-line per-book summary under the hero is enough; anything
  fancier is follow-up).
- Deleting books.

## Git workflow

- Branch: `feat/ai-books-switcher` off `main` (after 188 merges)
- Conventional commits per surface cluster.
- Do NOT push or open a PR.

## Steps

### Step 1: Semantics as tests — `bookScope.ts` + tests FIRST

Implement the four helpers above and cover, before any UI, these cases
(model on any pure-domain test, e.g. `dashboardSummary.test.ts`):
(a) `bookAccountIdSet(accounts, "all")` → set of ALL account ids (identity);
(b) `bookAccountIdSet(accounts, someBookId)` → only that book's account ids,
and `scopeRows` drops other books' rows;
(c) `fireMetricAccountIdSet` / `personalNetWorthAccountIdSet` include ONLY
accounts of books with the respective toggle true, and are INDEPENDENT of
any `activeBookId` argument (they don't take one);
(d) a transfer pair whose two legs are in different books stays
`isNeutralLedgerRow` for both — write the test proving a cross-book transfer
is counted as income/expense in NEITHER book's cash-flow view.

**Verify**: `npm test -- bookScope` → passes.

### Step 2: activeBookId state + sidebar switcher

Add `activeBookId: string` (a book id, or the literal `"all"` for 總帳) to
`uiPreferences` with the same manual-persist pattern as `holdingsColumns`.
Cold default = `"all"` (jsdom-safe, no repo access at store-init; the
switcher simply shows 總帳 on first run — do NOT try to resolve the default
personal book id inside the store). AppShell switcher between the Search and
Quick Add triggers, expanded + collapsed variants.

**Verify**: `npx tsc --noEmit` → 0; manual: switcher renders (reviewer does
the live pass).

### Step 3: Scope the surfaces, one commit per cluster

Work through docs/ledger-books-plan.md §1's table in this order. For each
surface use the RIGHT helper per the two-axis rule: general views →
`bookAccountIdSet(accounts, activeBookId)`; FIRE-family (#7 and #6) →
`fireMetricAccountIdSet` (switcher-independent).
(1) Dashboard cluster (#1 #2 general net-worth = switcher-scoped; #7
FIRE/northstar metrics = `fireMetricAccountIdSet`, and the hero KPI per
Step-1 case (c)/the STOP note about which figure the hero is),
(2) CashFlow cluster (#3 #4 #5 #12 — switcher-scoped), (3) Investments/
analytics (#9 — switcher-scoped), (4) annual report (#8 — add the book
selector at the top per §1), (5) goals (#6 — `fireMetricAccountIdSet`,
personal-only), leaving data-health (#11) unscoped-總帳 with a code comment
saying why. After EACH cluster: `npm test` green before the next.

**Verify** (after all): 188's `booksPartition.test.ts` still green
(unscoped/總帳 numbers identical); every cluster's route compiles; no
domain-function signature changed (`git diff src/domain/ | grep "^-.*export function"` → only bookScope additions).

### Step 4: Accounts assignment + 帳本管理 + entry defaults

Per Current state. Creating a 公司帳 with kind "company" gets toggles OFF
by default (188's semantics — verify via the form's initial state).

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0.

### Step 5: Full gate

**Verify**: `npm test` all green; done criteria below.

## Test plan

- `bookScope.test.ts`: the Step-1 semantics (identity/filter/toggles/
  cross-book-transfer-neutrality) — model on any pure-domain test.
- Surfaces themselves are route-level (untested by convention in this
  repo); the protection is 188's characterization test + bookScope's units.

## Done criteria

- [ ] `npx tsc --noEmit` 0; `npm run lint` 0; `npm test` 0 failures
- [ ] `booksPartition.test.ts` (from 188) untouched and green
- [ ] `bookScope.test.ts` exists covering the 4 semantic cases
- [ ] Switcher present in AppShell between Search and QuickAdd triggers
- [ ] Every §1 surface except #11 reads scoped inputs (grep each entry
      point for `bookAccountIdSet\|scopeRows\|fireMetricAccountIdSet`)
- [ ] No repository/sync/migration file modified (`git status`)

## STOP conditions

- Plan 188 not merged (drift-check gate).
- A surface can't be scoped at its inputs without changing a domain
  function signature — report which one; do not change signatures.
- The 總帳 view's numbers differ from pre-books numbers anywhere
  (partition broken — report the surface and delta).
- The AppShell sidebar structure no longer matches the excerpt.
- Scope creep pressure: you find yourself editing a 6th+ route file not in
  §1's table — stop and list what you think is missing instead.

## Maintenance notes

- Phase 2 (invoices) builds on `activeBookId` + kind==="company" books.
- The 總覽 per-book breakdown (deferred) and book deletion are known
  follow-ups.
- Reviewer scrutiny: toggle semantics on FIRE surfaces (the one place the
  switcher does NOT rule), QuickAdd default-account interaction with plan
  175's §6.5 default-account logic (they must compose: book filter first,
  then 175's default within it).
