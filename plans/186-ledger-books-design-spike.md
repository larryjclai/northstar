# Plan 186: 帳本 (Books) design spike — 公司帳/個人帳/總帳 + 發票稅金 + 共同記帳的統一模型

> **Executor instructions**: This is a DESIGN/SPIKE plan — the deliverable is
> a design document with options, a recommendation, and open questions, NOT
> code. Do not modify any source file. Write the deliverable to
> `docs/ledger-books-plan.md`. On a STOP condition, stop and report. Update
> this plan's status row in `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat bb051f59..HEAD -- src/domain/types.ts src/data/repositories.ts docs/split-legs-plan.md plans/143-household-sharing-spike.md`
> Material drift in the data model → compare before proceeding; the spike
> must design against the code as it IS.

## Status

- **Priority**: P3 (direction — biggest new surface since split legs; design before any build)
- **Effort**: M (investigation + writing; the build would be L/XL across ≥3 phases)
- **Risk**: — (paper only; the FEATURE risk is HIGH: it touches scoping of every money query)
- **Depends on**: read `docs/split-legs-plan.md` (176 outcome), `plans/143-household-sharing-spike.md` (TODO spike this must compose with)
- **Category**: direction
- **Planned at**: commit `bb051f59`, 2026-07-13

## Why this matters

Operator requirement (2026-07-13, verbatim intent): 他開了公司，需要把
**公司收入/支出**跟**個人收入/支出**分開記錄，但又要能看**總帳**。公司帳
另有兩個硬需求：(1) **開發票的稅金**（銷項營業稅）要能被記錄與彙總；
(2) 開發票後要**追蹤對方是否已匯款結清**。另外操作者明確指出：帳本
（books）與先前規劃的**共同記帳**（household sharing, plan 143）是同一族
需求，要一起設計，不要各自長出互斥的模型。

Northstar today has exactly one implicit book: every query in every route
reads ALL accounts and ALL ledger rows (the only scoping precedent is the
per-route `selectedAccount` filter). Bolting "company vs personal" on later
— after sharing ships against a book-less model — would force a painful
re-scope of every aggregation. This spike decides the model NOW, cheaply,
on paper. It produces `docs/ledger-books-plan.md`: the scoping decision,
the invoice/tax slice, the sharing alignment, and a phased build outline
that later build-plans can be cut from.

## Current state (what the design must build on — verify each during the spike)

- **No book concept anywhere.** `src/domain/types.ts`: `Account` (line
  64–90) and `LedgerTransaction` (line 92–160) have no book/workspace field.
  The one sharing-adjacent field is `Account.isSharedToHousehold: boolean`
  (line 78) — schema-plumbed through SQLite + sync but consumed by no
  feature (plan 143's finding; re-verify with
  `grep -rn "isSharedToHousehold" src/`).
- **Receivable tracking already exists** and is the natural spine for
  "發票開了、錢進來沒": `LedgerTransaction.settlementStatus:
  "settled" | "receivable" | "payable"` + `counterAccountId` (代墊
  pass-through semantics documented at types.ts:94–106), the 未結清 card in
  `CashFlowRoute.tsx` (~line 1614–1653), and the settle flow (plan 043).
  An issued invoice awaiting payment IS a receivable with extra metadata.
- **Split legs (plans 176/181/182, MERGED)**: sibling rows sharing
  `groupId` with `legKind: "category"`; `docs/split-legs-plan.md` reserved
  `legKind: "share"` for 分帳. A 含稅 invoice could be a split: revenue leg
  + 銷項稅額 leg — evaluate this against a dedicated invoice entity.
- **Finance invariants (AGENTS.md, non-negotiable)**: cash-basis net worth
  (+ adjusted with receivables/payables), reconciliation identity
  `assets − liabilities = net worth`, explainable & testable calculations.
  The spike must state per-book AND 總帳 versions of these identities.
- **Sync**: local SQLite via `src/data/repositories.ts` (dual repos,
  dual-harness tests — see `repositories.split.test.ts` for the pattern),
  E2E-encrypted envelopes to the worker; schema is alpha (additive columns
  acceptable, but migrations must not corrupt existing single-book data).
- **Plan 143 (household sharing spike) is still TODO** — books must be
  designed as the *future sharing boundary* without blocking on 143's key
  model. Read that plan file; its constraint "sharing must not collapse
  personal privacy" applies to books too (a shared book must not leak the
  personal book).
- **UX precedents**: `selectedAccount` filter (Dashboard/CashFlow),
  sidebar navigation in `src/components/` (for the book-switcher
  placement), QuickAdd (`src/components/QuickAdd.tsx`) which would need a
  default-book rule, zh-TW-first copy conventions.
- **Taiwan tax context the doc must encode** (domain knowledge, keep
  v1-minimal): 開立統一發票的營業人 charges 5% 營業稅; for a 含稅 total T,
  銷項稅額 = T × 5/105 (rounded per invoice); 401 申報 is bimonthly
  (1–2月, 3–4月, …). v1 is manual bookkeeping of issued invoices — NOT an
  e-invoice (財政部) integration.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Sanity    | `npm test`           | all pass (run once at start to confirm clean baseline; you change no code) |
| Greps     | `grep -rn "isSharedToHousehold\|selectedAccount" src/ \| head` | orient scoping surfaces |

## Scope

**In scope** (the only files you may create/modify):
- `docs/ledger-books-plan.md` (create)
- `plans/README.md` (your status row)

**Out of scope**:
- ANY file under `src/`, `src-tauri/`, `worker/` — paper only.
- Deciding plan 143's crypto/key model — reference it, don't preempt it.
- E-invoice/財政部 API integration, 進項稅額/labor-cost bookkeeping beyond a
  "future work" paragraph — v1 is 銷項 tracking only.

## Git workflow

- Branch: `feat/ai-ledger-books-spike`
- One commit is fine: `docs(plans): ledger-books design spike (plan 186)`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Investigate scoping surfaces

Enumerate every aggregation that a book boundary would partition: net worth
(DashboardRoute), cash-flow stats + activity (CashFlowRoute), budgets,
goals/FIRE metrics, annual report, analytics. For each, note whether it
should default to 個人帳, 目前帳本, or 總帳. Deliverable input, not code.

**Verify**: the doc's §"Scoping surfaces" table lists ≥8 surfaces with a
default-book column.

### Step 2: Write the data-model options (the heart)

> **DECIDED (operator, 2026-07-13): option (a) — `bookId` on Account.**
> The spike specifies (a) in full (schema, migration, sync, reconciliation
> identity, cross-book transfer + 股東代墊 flows); options (b)/(c) get a
> half-page each for the record only. Operator confirmed his company money
> lives in dedicated company accounts (no mixed-use card).

2–3 options, each ≤1 page, with migration story and sync delta:

- **(a) `bookId` on Account only** — transactions inherit their account's
  book; cross-book money movement is an ordinary transfer between accounts
  of different books (e.g. 公司戶 → 個人戶 = owner's draw). Simplest;
  matches "company money lives in company accounts". State how a
  cash-paid-company-expense-from-personal-wallet is recorded (股東代墊 →
  the existing 代墊/counterAccountId mechanism?).
- **(b) `bookId` on both Account and LedgerTransaction** (transaction
  override) — handles mixed-use accounts at the cost of scoping every
  query by transaction field and a confusing "account balance spans books"
  identity. State honestly what it does to the reconciliation invariant.
- **(c) Books as fully separate datasets** (per-book SQLite namespaces) —
  strongest isolation (nice for sharing), most expensive for 總帳.

Recommend one (the operator expects a recommendation; (a) is the likely
winner — argue it, don't assume it). Default book for ALL existing data =
個人帳; migration must be a single additive column + backfill.

**Verify**: doc contains the three options, each with Migration / Sync /
Reconciliation-identity subsections, and a bolded recommendation.

### Step 3: Invoice & 營業稅 slice

Design the v1 company-book flow: 開發票 → a receivable income row (existing
`settlementStatus: "receivable"`) carrying invoice metadata; 匯款結清 →
existing settle flow. Decide and specify:

- **Tax model (leaning A, operator reviewing)** — present BOTH with a
  worked numeric example (開立含稅 105,000 的發票) and a ledger-row truth
  table each:
  - **Model A (recommended v1)**: one receivable income row of the 含稅
    total, carrying BOTH `未稅額` and `稅額` fields (稅額 default =
    round(含稅 × 5/105), editable for rounding). Revenue reports offer a
    未稅口徑 (SUM of 未稅額 field); a「本期應繳營業稅」reminder card shows
    the accumulated unpaid 銷項稅額. Tax payment = ordinary expense row
    (category 稅捐). Known honest limitation: 調整後淨值 does not list
    unpaid VAT as a liability between invoicing and payment.
  - **Model B (documented as the v2 upgrade path)**: 未稅 revenue leg +
    a pass-through 代收營業稅 leg (net-zero cash-in now, cash-out at tax
    time — the 代墊 machinery's shape). Spike must show the cash identity
    (帳戶 +105,000 = 收入 100,000 + 代收 5,000) and why this needs a new
    `legKind`, then specify the mechanical A→B migration (fields → legs).
- Invoice metadata storage: additive nullable fields on `LedgerTransaction`
  vs a new `invoices` table. The operator's expanded scope (client master +
  aging + DSO) strengthens the dedicated-entity case — compare against the
  176 doc's mechanism inventory and pick, showing the sync delta for both.
- **客戶主檔 (operator-confirmed in scope)**: clients as first-class
  records (名稱, 統編, default terms), auto-filled via the existing
  merchant-autocomplete pattern (plan 180's `chooseMerchant` precedent).
- **帳齡 + 收款指標 (operator-confirmed in scope)**: per-invoice due date,
  aging buckets (30/60/90), and 平均收款週期 (DSO = mean days from 開立 to
  結清 over a trailing window) — specify the queries against the
  receivable/settle timestamps.
- Bimonthly 銷項稅額 summary (401 prep) = SUM of 稅額 per two-month period.

**Verify**: doc §"發票與營業稅" specifies storage choice, the rounding rule,
and the 401-summary query in one paragraph each.

### Step 4: 共同記帳 alignment

One page: book = the sharing boundary. **DECIDED (operator, 2026-07-13):
the end goal is 雙向共寫 (both members write into a shared book)** — not
just plan 143's read-only projections. Design note the spike must develop:
the sync engine already resolves concurrent multi-device edits (per-row
revisions/LWW), so two-way write is architecturally "multi-device sync
where the devices belong to two people" — the genuinely new problems are
the key/privacy boundary (per-book envelope namespace + book key wrapped
to member devices; composes with 143's key-model options) and membership/
revocation. Sequence it honestly: read-only shared projections first
(143's scope), 雙向共寫 as the explicit target with its extra risks named
(conflict UX, category/account references crossing vaults). The company
book is just another non-shared book. Nothing in the books v1 build may
hard-code "exactly 2 books" or "books are local-only".

**Verify**: doc §"共同記帳對齊" exists and cites plan 143 by path.

### Step 5: UX sketch + phased build outline

- Book switcher: recommend placement (sidebar, above navigation — near the
  existing Search) with 總帳 as a pseudo-book view; per-book accent color;
  QuickAdd + EntryDrawer default to the active book; 總覽 in 總帳 mode must
  label company vs personal contributions. **DECIDED (operator,
  2026-07-13): FIRE/淨值 inclusion is a per-book toggle, not a hard rule** —
  each book carries `計入個人淨值` / `計入FIRE指標` switches; defaults:
  personal books ON, company books OFF; 總帳 view always shows everything
  regardless. Rationale: the app must serve 行號 (personally-taxed owners
  may toggle ON) and 有限/股份有限公司 (legally separate, default OFF)
  without encoding entity law — the operator himself is a single-owner
  有限公司 and accepts the OFF default given the toggle exists.
- Phases: **Phase 1** books + switcher + scoped queries + migration;
  **Phase 2** invoice/稅金/客戶主檔/帳齡+DSO on the company book;
  **Phase 3** shared books read-only (blocked on 143); **Phase 4** 雙向共寫.
  Each phase with rough effort and the plan files it
  would become.

**Verify**: doc ends with the phase table + numbered "Open questions for the
operator", each with a recommended answer.

### Step 6: Index update

Update your row in `plans/README.md` (183–186 table) with DONE + one-line
outcome.

## Test plan

None — doc-only. `npm test` at start confirms you began from a green tree;
`git status` at end must show only the two in-scope files.

## Done criteria

- [ ] `docs/ledger-books-plan.md` exists with all five sections (scoping
      table, model options + recommendation, 發票/稅金 slice, 143 alignment,
      phases + open questions)
- [ ] No `src/`, `src-tauri/`, or `worker/` file modified (`git status`)
- [ ] Every factual claim about current code carries a `file:line` or grep
      reference re-verified during the spike (not copied from this plan)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `git log --oneline -20` shows a books/workspace/multi-ledger feature has
  started since planning (design would race the build).
- `docs/split-legs-plan.md` or plan 143 is missing/materially rewritten —
  the composition targets moved.
- You cannot determine how `isSharedToHousehold` currently flows through
  sync — flag it in the doc as an open question rather than guessing.

## Maintenance notes

- The build plans cut from Phase 1 must include a **characterization-test
  step first**: snapshot 總覽/記帳 aggregates on a seeded dataset, then
  assert 總帳 mode reproduces them exactly after the book column lands
  (books must be a pure partition — no money appears or disappears).
- Whoever executes plan 143 later must read this spike's §4 first.
- Deferred by design: 進項稅額 (expenses' input VAT), 營所稅, multi-company,
  e-invoice APIs.
