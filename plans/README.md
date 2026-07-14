# Implementation Plans

Backlog index for the `improve` skill. Each `plans/NNN-*.md` holds a plan's full
spec + its own Status block; this index keeps only **live, actionable state**.

> **Slimmed 2026-07-12.** ~500 lines of dated reconcile narrative + verbose
> per-plan rows (001–155, all long since merged) were removed to keep this index
> cheap to read — it is NOT auto-loaded into context, but every `/improve` op
> re-reads it. All removed detail is preserved in each plan file and in this
> file's git history (`git log -p plans/README.md`). Nothing was lost.

## Current state — 2026-07-13 (`main` @ `48a74719`, v0.1.0-alpha.59)

- **170–182: ALL executed, reviewed+APPROVED, and MERGED to `main`.** The
  operator decided all three spike outcomes (172→A+TWR, 176→MOZE-style splits,
  175→Tier 2 parked; pain points → 180) and the decision builds 179–182 are in.
  Combined-main gates green: `tsc --noEmit` 0, `lint` 0 errors, **1155 tests**.
  Not pushed to remote (local merges only). Outstanding: operator live pass on
  the 182 split flows + 179 nudge visuals; old spikes 142/143 remain TODO.
- **Reconciled 2026-07-13** (`/improve reconcile` @ `607d0c41`): all 170–182
  done-criteria re-verified by grep at HEAD ✓; **156–163 motion batch found
  MERGED** (index said unmerged — corrected; 161 spike correctly unmerged);
  **Vite dev-proxy 502 found FIXED** independently → retired; RecurringRulesTab
  free-text retired (174); 088 Feature A downgraded to largely-addressed
  (lexicon + 174); Tier-2 marked PARKED; 分帳 phase-2 now plan-able. 142 (DCA
  spike) + 143 (household spike) drift-checked and still valid TODO (DCA still
  hidden, `isSharedToHousehold` still test-only).

## Earlier state — 2026-07-12 (`main` @ `4ac63576`, v0.1.0-alpha.58)

- **001–155: all DONE and merged to `main`.** Per-plan detail is in each
  `NNN-*.md` and git history. Grouped record below. Only two in that range were
  never built (still TODO): **142** DCA decision spike, **143** household-sharing
  design spike — both P3, client-only, dispatch when wanted.
- **156–163: motion / native-feel batch** — executed, reviewed, **ALL APPROVED**,
  but **UNMERGED** (a stacked branch chain). Your merge decision — see next section.
- **164–167: 總覽 + 投資 redesign** — MERGED + released in `v0.1.0-alpha.57`.
- **168–169: 記帳 (Cash Flow) redesign** — MERGED + released in `v0.1.0-alpha.58` (with the 8-item UI fix batch).
- **170–178: direction batch (`/improve next`, 2026-07-12)** — all TODO; see next section.

## 170–178 — direction batch (`/improve next` @ `4ac63576`, 2026-07-12)

Direction audit (roadmap/product intent vs code). **Headline recon finding:
Phase 6 is mostly SHIPPED** (6.1 northstarMetrics hero, 6.2 coverageRatioPct,
6.3 runwayMonths, 6.4 projection, 6.5 longViewMode/milestones) and roadmap 5.2
restore preview shipped for local backups (plan 047) — ROADMAP.md is stale;
plan 178 fixes it. Operator selected all six audit findings plus two write-ins
(iOS App 上架, 快速記帳再強化). All nine are independent — no ordering
dependency; numbered by rough leverage. 172/176 are **design spikes** (doc +
PoC, no UI ships); 177 Phase B is operator-only.

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 170 | Restore preview (counts diff + typed confirm) for the two remaining paths: JSON import + sync-backup restore | P2 | M | — | DONE — reviewed+APPROVED, branch `fix/ai-restore-preview-gaps` @ `284ae0a7` (MERGED to main; adds `readBackupSnapshot`+`getBackupEntry` refactor, JSON-import + sync-backup previews mirror plan-047, new `backup.test.ts` 4 tests w/ in-memory IDB fake; tsc 0 / lint 0 / 1058 tests) |
| 171 | Debounced auto-push ~30s after local edits (roadmap 5.3①) via new pushScheduler + useAutoSync handler | P2 | M | — | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-sync-debounced-push` @ `558add9a` (dumb 30s debounce `pushScheduler.ts`+4 tests, 2 funnels in hooks.ts, handler in useAutoSync under isTauriRuntime gate w/ cleanup; frozen sync files untouched; tsc 0 / lint 0 / 1058 tests) |
| 172 | Index-Nudge design spike (roadmap 6.6, last unbuilt Phase-6 item) — return-series honesty (fixed-basket vs TWR), detection PoC in domain, variant A/B/C decision doc | P2 | M | — | DONE — reviewed+APPROVED+MERGED (spike), branch `feat/ai-index-nudge-spike` @ `292e4289` (`docs/index-nudge-spike.md` + `domain/indexNudge.ts`+11 tests, no UI). **Q1 finding: honest TWR (`buildPortfolioTwr`) exists but every vs-benchmark surface (Alpha card + Dashboard `benchmarkGap`) is wired to the FIXED-BASKET approx. Recommends variant A (proactive banner) on TWR-vs-benchmark rolling windows. ⚠ OPERATOR DECISION (variant A/B/C + params) gates the build.** |
| 173 | 年度報表列印/匯出 — print-CSS + 列印按鈕 on /reports/annual (Tauri-print feasibility gate first; PDF lib only via escape hatch) | P2 | M | — | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-annual-report-print` @ `ae564994` (`@media print` + 列印/匯出 PDF button + `annualReportPrint.ts`+7 tests; privacy-mask gate). **Feasibility: `window.print()` works in Tauri macOS webview + browser, no dep/capability needed.** tsc 0 / lint 0. ⚠ visual print-preview + mobile button-gating deferred (see follow-up). |
| 174 | Recurring rules structured category picker (kills free-text at RecurringRulesTab:467) + suggest-and-confirm bulk categorization of uncategorized txns | P3 | M | — | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-category-picker-bulk-categorize` @ `3c610b77` (Part A chip picker; Part B `bulkCategorize.ts`+10 tests + `BulkCategorizeCard` in CashFlow overview; confirm-gate verified, 5 exclusion guards). **Plan-assumption correction: CashFlow stores category as TWO fields (category+subcategory), not one composed string — executor adapted.** tsc 0 / lint 0 / 1064 tests. |
| 175 | 快速記帳再強化 — inventory quick-add-nlp-plan §6/§11 vs code, ship ≤3 offline gaps (§6.4/6.5/6.7), Tier 2 cloud spec-only (operator decision) | P3 | M | — | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-quickadd-next-wave` @ `2b9ca902` (inventory annotated in spec; **§6.7 already shipped** so built only §6.5 default-account + §6.4 example chips; `quickAdd.test.ts` byte-unchanged). **Tier 2 §12 decision-draft appended → ⚠ OPERATOR DECISION gates any cloud build.** Unbuilt §6 items (6.2 token-highlight, 6.3 preview remediation) listed as follow-up. |
| 176 | Split-legs data-model spike — one schema decision serving 分帳 + 多類別 (repo already has 3 bespoke linked-record-group mechanisms) | P3 | M | — | DONE — reviewed+APPROVED+MERGED (spike, doc-only), branch `feat/ai-split-legs-spike` @ `8fe979f7` (`docs/split-legs-plan.md`; mapped 4 mechanisms). Recommends sibling parent+legs on existing `groupId` + additive nullable `legKind`; no migration (plain row = singleton group); 代墊 reused for 分帳 應收/應付. ⚠ surfaced open risk → see follow-up below. |
| 177 | iOS App Store readiness — submission dossier, privacy label w/ grep evidence, export compliance, icons, Phase-B operator runbook ($99 enrollment NOT executor's) | P3 | M | — | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-appstore-readiness` @ `56fb11bd` (`docs/app-store-submission.md` 467 lines + ios-mobile-plan link; check:tauri passed). **Privacy claim verified: NO tracking SDKs → "Data Not Collected".** Export-compliance = `ITSAppUsesNonExemptEncryption=false` (left as operator apply-step; Info.plist in regenerated gen/apple). ⚠ Phase B ($99 enroll, signing, sim-build, icon-gen, submit) = OPERATOR-ONLY. |
| 178 | Roadmap reality-sync — mark 6.1/6.2/6.3/6.5 + 5.2(local) shipped, retire stale analytics follow-up | P3 | S | coordinate wording w/ 170 | DONE — reviewed+APPROVED, branch `fix/ai-roadmap-reality-sync` @ `09b40afd` (MERGED to main; ROADMAP.md only — executor scoped to it, reviewer applied the plans/README.md Step 2 below) |

Direction findings NOT re-planned: household sharing → existing TODO spike
**143**; DCA rework → existing TODO spike **142**; iOS $99 enrollment /
signing / App Store Connect = operator-only (177 Phase B).

## 179–180 — operator decisions on the spikes (2026-07-13, planned at `f8473bef`)

Operator reviewed the 172/175/176 decision points:
- **172 → decided: variant A + 全面改接 TWR** → build plan **179**.
- **175 Tier 2 → effectively deferred**; operator instead reported two real
  Quick Add pain points (no merchant autocomplete; merchant/name duplication
  without `@`) → build plan **180**. Tier 2 §12 draft stays parked in the spec.
- **176 → DECIDED (2026-07-13, MOZE screenshots as reference)**: sibling-legs
  model approved. Entry = MOZE-style: category area gains「+」, multi-select
  categories EACH with their own amount, form total = derived sum (not
  fixed-total allocation). List = one collapsed row +「拆分 N 筆」badge,
  expandable to legs. Edit re-enters the same form. 分帳 = phase 2.
  → build plans **181** (foundation) + **182** (UI).

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 179 | Index Nudge variant A + repoint analytics Alpha card & Dashboard benchmarkGap to TWR (fixed-basket fallback + 口徑 labels; suggestive copy; params 8 windows / 5pp hardcoded) | P2 | L | 172 (done) | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-index-nudge-build` @ `590de4be` (geometric rebase to first common date, triple-gated banner — never renders off fixed-basket; basis-dependent disclaimers; Dashboard had records already, no STOP; +6 window-builder tests; tsc 0 / lint 0 / 1099). ⚠ known scope: nudge evaluates over the SELECTED analytics period → fires only on 5Y/All/long ranges (needs ≥8 quarters in-window); always-full-history evaluation = possible follow-up. |
| 180 | Quick Add 商家 autocomplete dropdown + known-merchant extraction (stop name/merchant duplication without `@`) — sanctioned quickAdd.test.ts merchant/name assertion updates, category VALUES must not change | P2 | M | — | DONE — reviewed+APPROVED (1 revision round)+MERGED, branch `feat/ai-quickadd-merchant-ux` @ `e3a70703` (known-merchant extraction w/ longest-match + substring split + digit-merchant amount masking; inline autocomplete dropdown reusing `chooseMerchant`; 13 merchant/name-only assertion updates, zero category-value changes; REVISE fixed the `tier0Insufficient` escalation regression — now inspects name AND merchant, +3 nlParser tests; tsc 0 / lint 0). Follow-up noted: same autocomplete belongs on EntryDrawer 商家 field. |
| 181 | 多類別拆分 foundation — `legKind` column, `buildSplitLegs`, `createSplit`/`updateSplit` (both repos, dual-harness tests), `incompleteSplitGroupIds` guard | P2 | M | — | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-split-legs-foundation` @ `c6c619a5` (updateSplit = tombstone-all+recreate SAME groupId w/ revision bumps in one SQLite transaction; signs: expense −/income +, builder applies; +6 splitLegs +10×2 dual-repo +4 ledgerTrust tests; consumers untouched; tsc 0 / lint 0). Signatures for 182: `createSplit(shared, legs)` / `updateSplit(groupId, shared, legs)` / `SplitLegInput={amount>0, category, subcategory}` / errors zh-TW (拆分至少需要 2 筆明細。 etc.). |
| 182 | 多類別拆分 UI — MOZE-style multi-category EntryDrawer (+分類, per-leg amounts, derived total), list collapse+expand mirroring the transfer precedent | P2 | L | 181 | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-split-legs-entry-ui` (「＋ 分類」split mode w/ per-leg amount + derived「多類別 · 共 $X」, save via create/updateSplit, edit hydrates all legs, fee-leg pairs excluded via legKind gate; list collapse in `mergeTransferRows` + 拆分 N 筆 badge + inline expand; `splitEntryState.ts` +17 tests; aggregation audit: all money sums use RAW rows, no double count; tsc 0 / lint 0 / 1146). Scope notes: plain→split conversion while editing not offered; split affordance hidden for 外幣/installment; needs operator live pass (add/edit/delete/expand + totals). |

## 183–186 — operator UX batch + 帳本 spike (2026-07-13, planned at `bb051f59`)

Operator-reported items (`/improve` with screenshots). One item needed no
plan: **多類別記帳的桌面版入口已存在** — EntryDrawer 支出/收入表單選好分類後,
分類列尾端出現虛線「＋ 分類」按鈕即進入拆分模式（182 的 scope notes:
編輯既有單筆不能轉拆分、外幣/分期不提供拆分）— answered, nothing to build.
183/184/185 are independent S-effort UI fixes; 186 is a design spike
(doc-only, no code) for the 公司/個人 books requirement.

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 183 | 記帳列表金額置右對齊 — `ns-cf-actions` hover 鈕改 absolute overlay（Gmail-style）+ touch 裝置整組隱藏（detail panel 已有同功能）+ day-header Net 對齊 20px 右緣 | P2 | S | — | DONE — reviewed+APPROVED, branch `fix/ai-cashflow-amount-alignment` @ `f13c3fd0` (CSS overlay w/ pointer-events gate + `--ns-shadow-1` per plan's allowance; executor live-verified computed styles on a worktree Vite; tsc 0 / lint 0 / 1155 tests). MERGED to main @ `eb5f30d8` (operator-instructed, 2026-07-13). Plan's Step-3 grep expected 1 match, got 2 — pre-existing unrelated `"14px 20px"` literal at :1533, verified predates plan. |
| 184 | 持倉表數字對齊 — 未實現損益 % 移至副行（block sub-line）、市值/成本基礎貨幣字尾定寬 `w-9`，數字右緣一致 | P2 | S | — | DONE — reviewed+APPROVED, branch `fix/ai-holdings-numeric-alignment` @ `5179adec` (exactly the 3 in-scope cells; tsc 0 / lint 0 / 1155 tests; greps 1+2 as specced). MERGED to main @ `7814304e` (operator-instructed, 2026-07-13). Executor NOTE: briefly created its branch in the shared checkout by mistake, self-reverted cleanly (verified by reviewer: main @ bb051f59 clean). |
| 185 | 總覽預算進度只列有設定預算的分類 — 移除「無上限」假進度條分支，空狀態改指引設定預算 | P2 | S | — | DONE — reviewed+APPROVED, branch `fix/ai-dashboard-budget-budgeted-only` @ `4935afcb` (type-predicate filter, 無上限/0.5-bar branches removed, new empty-state copy; tsc 0 / lint 0 / 1155 tests; 無上限 grep = 0). MERGED to main @ `f923875f` (operator-instructed, 2026-07-13). |
| 186 | 帳本 (Books) design spike — 公司/個人/總帳 scoping model（已決策：bookId on Account）、發票+銷項營業稅 v1 slice（Model A 傾向、B 為 v2 路徑；客戶主檔+帳齡+DSO 入列）、共同記帳終極目標雙向共寫、per-book 淨值/FIRE toggle → `docs/ledger-books-plan.md` | P3 | M | read 176 doc + plan 143 | DONE — reviewed+APPROVED (1 revision round), branch `feat/ai-ledger-books-spike` @ `a03cf86e` (`docs/ledger-books-plan.md` 424 lines, doc-only; 12-surface scoping table, option (a) bookId-on-Account fully specified w/ per-book+總帳 reconciliation identities, Model A tax v1 + Model B/`legKind:"tax"` v2 path w/ A→B migration, dedicated `invoices`+`clients` tables, 5 open questions w/ recommendations). REVISE fixed: DSO must read an explicit `invoices.settledAt` stamped at settle — NOT the ledger row's `updatedAt` (bumped by any later edit). MERGED to main @ `f892a1d6` (operator-instructed, 2026-07-13); Phase 1 build plans cut from `docs/ledger-books-plan.md` after operator reviews its 5 open questions. |

Dependency notes: none between 183–185 (different files: globals.css+CashFlowRoute /
InvestmentsRoute / DashboardRoute). 186 is paper-only and gates any books build;
its Phase 3 (shared books) stays blocked on spike 143.

**186 open questions — OPERATOR ANSWERED (2026-07-13), bake into the Phase 1/2 build plans:**
1. Budgets/goals = personal books only (per recommendation).
2. Cross-book 股東代墊 shows in 未結清 from BOTH books (per recommendation).
3. Invoice numbering = BOTH free-text AND auto-sequencing, user-toggleable; must support
   台灣統一發票 字軌 input (2-letter track prefix + 8 digits, tax-authority-issued blocks);
   UI must present this as the Taiwan 統一發票 feature — or design the field generically.
   **CONFIRMED design (operator approved advisor's recommendation)**: generic
   prefix(字軌)+sequence invoice-number structure; a「統一發票 (TW)」preset supplies 字軌
   validation (2 letters + 8 digits) and auto-sequencing; other locales get plain
   prefix+sequence. EXPANDS Phase 2 scope beyond the doc's free-text-only recommendation.
4. 401 summary = live query for v1 (per recommendation).
5. Shared books = convert-in-place upgrade of an existing book (per recommendation).
   Note: nothing to migrate TODAY (books don't exist yet) — this decision means Phase 1's
   schema must keep per-book envelope namespacing from day one so the later upgrade is
   "invite a member", not a data migration. Already the doc's design; now operator-locked.

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 187 | 持倉表跨列對齊 root-cause fix — per-row independent grids + `auto` optional tracks → fixed px tracks per column key (advisor measured live DOM: 台積電 row shifted 4–12px; header on a 3rd offset) | P2 | S | 184 (merged) | DONE — reviewed+APPROVED+MERGED to main @ `7c08b45c` (operator-instructed), branch `fix/ai-holdings-grid-fixed-tracks` @ `103e0651`. Reviewer re-measured live DOM post-merge: all 5 rows + header resolve IDENTICAL column edges [489,589,688,805,931,1071,1171,1223] (pre-fix: rows differed 4–12px, header a 3rd offset). Executor self-corrected a stale worktree base by branching from main. tsc 0 / lint 0 / 1155 tests. |
| 188 | 帳本 Phase 1a foundation — `Book` entity + `accounts.book_id` + migration/自癒 backfill(個人帳)+ sync 接線(8 個 tableByEntity sites, compiler-guided)+ 純分割特徵測試先行 + dual-harness books tests | P2 | M | 186 doc (merged) | DONE — reviewed+APPROVED+MERGED to main @ `fd724031` (operator-instructed), branch `feat/ai-books-foundation` @ `7e9891ee`. `Book` entity + `Account.bookId` + migration id 5 + idempotent 個人帳 backfill w/ revision-bump; sync接線全補(4 tableByEntity + browser keyByEntity + 2 outbox trigger arrays + pull VALID_ENTITIES + conflictSummary label + normalize boolean hydration + insertBookRow); +booksPartition characterization (byte-frozen, asserts netWorth/cash/liabilities incl. 對帳恆等式) + 12 dual-harness tests incl. SQLite outbox-tracking guard. **TWO executor STOPs, both correct** (pull.ts VALID_ENTITIES + conflictSummary.ts — literal/Record entity lists tsc-or-silently-missable; now the verified-complete set of 4 non-test SyncEntity consumers). push.test 3→4 = legit behavior change (default book syncs). tsc 0 / lint 0 / 1171 tests. |
| 189 | 帳本 Phase 1b UI — 側欄切換器(Search 與 QuickAdd 之間)、`bookScope.ts` 語意先寫成測試(總帳 identity / 過濾 / FIRE toggles / 跨帳本轉帳中性)、§1 12 surfaces 逐 cluster 範圍化、帳戶歸屬+帳本管理、QuickAdd/EntryDrawer 預設帳本 | P2 | L | 188 MERGED | DONE — reviewed+APPROVED (1 STOP for operator hero-KPI decision), branch `feat/ai-books-switcher` @ `59866d9c` (9 commits, off `fd724031`). NOT merged — awaiting operator. `bookScope.ts` (4 helpers, 7 tests) + sidebar 帳本 switcher + 12 §1 surfaces scoped per two-axis rule (general=switcher, FIRE-family=fireMetricAccountIdSet switcher-independent) + AccountsRoute 帳本 select + 帳本管理 modal + QuickAdd/EntryDrawer book-default. **Hero-KPI: operator decided netWorth follows switcher; firstGoalPct/FIRE recomputed from personalNetWorthAccountIdSet so they DON`T move with switcher.** Zero repo/sync/migration change. tsc 0 / lint 0 / 1178 tests; 188 booksPartition byte-unchanged+green. **Reviewer LIVE browser pass (worktree vite): switcher renders between Search/QuickAdd + lists 總帳/個人帳/公司帳; 帳本管理 modal creates books; 個人帳 toggles ON / 公司帳 toggles OFF (188 semantic verified in UI); 0 console errors.** Executor judgment calls (all sound): milestone toast bound to personalNetWorth; cross-book transfer/代墊 pickers full-list; asset book-membership by owning-or-linked account. |

## 168–169 — 記帳 (Cash Flow) redesign (from Claude Design, 2026-07-12)

Imported from `記帳交易 Redesign.html` (project `a2b50679…`,
`northstar-ledger-redesign.jsx`) via DesignSync. Operator chose **toolbar B + B-2**
and **bottom A + D** (of toolbar A/B/B-2 and bottom A/B/C/D). Both are
layout/interaction only — no finance math or filter-semantics change. Independent
(both preserve/read the existing `dateScope` state); execute in either order.

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 168 | Toolbar — single period control (B-2 stepper+popover) + 篩選 popover with count badge & active-filter chips (B); account/category leave the header | P2 | L | — | DONE — reviewed+APPROVED, branch `feat/ai-cashflow-toolbar` @ `9af7fe70` (unmerged; new `LedgerDateControl` + `activeFilterChips`+5 tests; DateScopeControl untouched) |
| 169 | 近期動態 + 固定收支 — right-column upgrade (30-day recurring + 未結清 moved in, sticky) + load-more/recent-3-days (A), and month-collapse for >3-month ranges (D) | P2 | L | — | DONE — reviewed+APPROVED, branch `feat/ai-cashflow-recent-recurring` @ `fc394c70` (unmerged; extracts `cashFlowGrouping`+6 tests; executor caught+fixed a visibleCount load race) |

**⚠ Both 168 & 169 edit `CashFlowRoute.tsx`** (168 the header ~906–1015; 169 the
bottom ~1178+, `UpcomingPayments`, and it extracted `groupByDay`→`cashFlowGrouping.ts`).
Regions are mostly disjoint, but the **import block overlaps** — merging both will
likely need a small manual conflict resolution there (and possibly `globals.css`,
though the new classes are distinct). Merge one, then merge/rebase the other and
resolve the imports.

Planned at `bdfa0c09`. Key constraint (both): reuse `dateScope`/`resolveDateScope`,
the `selectedAccount`/`selectedCategory` filter state (sentinel `"all"`), and the
`groupByDay`/`settlements`/`recurringRows` data — the same rows must match and the
same amounts must net. 168 must NOT regress `DateScopeControl`'s other callers
(Dashboard/Investments) — prefer a new `LedgerDateControl`.

## 156–163 — motion batch — ✅ MERGED (reconciled 2026-07-13)

Executed + reviewed via `/improve execute`, delivered as a linear stacked chain.
**Reconcile verification (2026-07-13): all seven implementation tips
(44039cc7…e4a85cca) are ancestors of `main`** — the chain was merged before the
alpha.56 release. The 161 spike branch (`46b00892`) is correctly NOT merged.
The pre-merge device eyeball list below is therefore now a POST-merge live-QA
list (still outstanding; folded into the manual-verification section).

| Plan | What | Branch @ tip |
|---|---|---|
| 156 | hover-gating for touch, row press-feedback, FAB safe-area, `transition:all`/keyframe cleanup | `fix/ai-touch-hover-hygiene`@`44039cc7` |
| 157 | ModalShell symmetric enter/exit motion (render-prop `dismiss`; caught + fixed a plan design flaw) | `feat/ai-overlay-exit-motion`@`f290d7b9` |
| 158 | Toast motion + hover/hidden-tab pause + swipe-dismiss | `feat/ai-toast-motion`@`ff653c42` |
| 160 | ⌘K instant, QuickAdd 140ms, segmented sliding thumb, privacy scroll+blur, haptics wrapper | `feat/ai-interaction-polish`@`5d008ca5` |
| 159 | mobile bottom-sheet presentation + drag-to-dismiss (momentum) | `feat/ai-bottom-sheet-gestures`@`8bbf8420` |
| 162 | CashFlow EntryDrawer exit motion (reuses 157 classes; keeps sidebar-offset scrim) | `feat/ai-entrydrawer-exit-motion`@`1686d574` |
| 163 | `prefers-reduced-motion` → `::view-transition-*` pseudos (161 a11y finding) | `feat/ai-reduced-motion-vt-guard`@`e4a85cca` |
| 161 | GA motion **SPIKE** — doc + THROWAWAY PoC (do NOT merge) | `feat/ai-ga-motion-spike`@`46b00892` |

**To merge:** the chain tip **`feat/ai-reduced-motion-vt-guard` @ `e4a85cca`
contains all seven implementation plans** (156+157+158+160+159+162+163) — merging
it lands everything at once. Do NOT merge the 161 spike branch; cherry-pick only
`docs/motion-ga-spike.md` if you want the findings doc.

**Pre-merge eyeball** (device/live — deferred by design; jsdom can't run CSS
transitions or pointer gestures): overlay enter/exit + ×/取消 animation; toast
swipe/pause; ⌘K instant; segmented slide; privacy scroll+blur; bottom-sheet drag;
EntryDrawer exit; real haptics on an iOS build.

**161 spike verdicts** (full doc: `docs/motion-ga-spike.md`): **A** View
Transitions push/pop = **GO** (scope via `view-transition-name` on `.ns-app-main`,
never root, so chrome stays static); **B** scroll-edge fade = **do-top-2** (demo
banner + analytics in-page nav only — no sticky table headers exist); **C**
Dynamic Type = **DEFER past GA** (two independent fixed-px type systems;
`-webkit-text-size-adjust:100%` already disables inflation → rem alone insufficient).

## 164–167 — 總覽 + 投資 redesign (from Claude Design, 2026-07-12)

Imported from claude.ai/design project `a2b50679-620a-465b-80c5-ef0ca5574bce`
(`Overview + Invest Redesign.html`) via DesignSync. Four independent, siblable
plans — no ordering dependency; execute in any order (or parallel branches).
**All are layout/IA only; none change financial math.** Operator chose Overview
**Direction A「一眼脈搏」** (of three variants A/B/C in the design).

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 164 | Overview redesign — Direction A minimal pulse (FX→header, merge bills/cards/AR-AP into 待辦, default-hide allocation/goals/recent/projection+trend, demote trend behind 版面) | P2 | L | — | DONE — reviewed+APPROVED, branch `feat/ai-overview-variant-a` @ `aa6979d8` (unmerged; incl. operator tweak: 淨值趨勢 now default-hidden too) |
| 165 | 持倉 tab — slim 5-col table + expandable rows, KPI cards→one strip, donut→thin distribution bar, 回補分類→⋯ | P2 | L | — | DONE — reviewed+APPROVED, branch `feat/ai-holdings-slim-table` @ `ab7fe66f` (unmerged) |
| 166 | Holding Detail — collapsible「今日」band (3 cells + impact; **no OHLC in data layer** so 開盤/區間 omitted, not faked) | P2 | M | — | DONE — reviewed+APPROVED, branch `feat/ai-holding-detail-today-band` @ `1fb247fc` (unmerged; adds pure helper `src/routes/holdingDetailToday.ts` + 7 tests) |
| 167 | 分析 tab — one global period control (+Custom), reorder to 01 報酬 / 02 貢獻 / 03 風險 / 04 股利 / 05 集中度 with scope tags, delete 365D calendar heatmap | P2 | L | — | DONE — reviewed+APPROVED, branch `feat/ai-analytics-global-period-reorder` @ `4063b049` (unmerged; incl. operator tweak: YTD+5Y presets restored; 02 貢獻 tag = 不隨期間·成本基準) |

### 164–167 — MERGED & RELEASED in `v0.1.0-alpha.57` (2026-07-12)

All four executed via `/improve execute`, reviewed, **APPROVED**, operator tweaks
applied, then **merged to `main`** (four `--no-ff` merges off `9441c152`) and
released as **`v0.1.0-alpha.57`** (`cc66b467`, tag pushed). Combined-`main`
verification before tagging: `tsc --noEmit` 0, `npm test` **1040/1040** (100
files), `npm run lint` 0 errors. No financial math changed (analytics/domain
untouched; day-change reuses `dayChangeMovers`). **Binary publish still pending** —
`./scripts/release-local.sh v0.1.0-alpha.57` (local signed macOS build) is the
operator's step; the source + tag are pushed but no release workflow auto-fires.

| Plan | Branch @ tip | Files |
|---|---|---|
| 164 | `feat/ai-overview-variant-a` @ `aa6979d8` (5 commits) | `DashboardRoute.tsx`, `uiPreferences.ts` |
| 165 | `feat/ai-holdings-slim-table` @ `ab7fe66f` (1) | `InvestmentsRoute.tsx`, `globals.css` |
| 166 | `feat/ai-holding-detail-today-band` @ `1fb247fc` (1) | `HoldingDetailRoute.tsx`, `holdingDetailToday.ts`(+test) |
| 167 | `feat/ai-analytics-global-period-reorder` @ `4063b049` (2) | `InvestmentsAnalyticsTab.tsx` |

Note: `package-lock.json` shows an uncommitted version-field sync (alpha.55→.56)
in each worktree from `npm install` — a stale-lock catch-up, not a dependency
change; ignore or commit at merge.

**Key cross-cutting constraint (all four):** the app stores only daily `close`
per `DailyPrice` and `{symbol,price,currency}` per quote — **no open/high/low/
previousClose**. Day-change % and impact are derivable (reuse `dayChangeMovers`
in `domain/portfolioAnalytics.ts`); OHLC-dependent design cells are omitted, not
invented. Per-holding day-change may need `dayChangeMovers` to expose raw prices
— each plan flags that as a STOP/escape-hatch rather than duplicating valuation.

## Grouped record — 001–155 (all merged to `main`)

- **001–004** initial UI fixes. **072–078** licensing / RN-feasibility / decision docs.
- **079–095** Apple-platform + market-data batch (macOS native feel, notifications,
  SITCA/TWSE search, sync dedup, notification center). 090 superseded by 094.
- **096–111** 2026-07-02 correctness + critique batch (cash-leak, QuickAdd kind,
  privacy-mask, number-credibility, decimal precision, DRIP, notification entry).
- **112–115** chart semantics + annual-tax deepen + style-system rule & cleanup.
- **116–117** no-dep markdown renderer (AI summary + updater toast).
- **118–149** 2026-07-09 deep-audit batch (fee autofill, repo parity, FX visibility,
  perf memoization, dual-repo test harness, migration tests, CI build surface, sync
  orchestration + worker tests, Stronghold cutover, ECDH pairing, per-device
  revocation, worker hardening, gain/loss tokens, aria-labels, scrim tokens,
  ModalShell a11y, docs reality-sync). 140 rejected (shipped independently).
- **150** GitHub security-alerts clear. **151–155** operator bug batch (SITCA
  cert-code search, Chinese-name search, QuickAdd sidebar clipping, category-kind
  persistence, scroll-lock on documentElement).

## Open follow-ups (surfaced, not yet planned)

- **138 tail — RE-INVENTORY before planning.** The old list of ~10 overlays to
  migrate to ModalShell is now **stale**: 157 (render-prop ModalShell across 14
  call sites), 159 (bottom-sheet + 更多 sheet), and 162 (EntryDrawer) migrated most
  of it. Re-grep `<ModalShell` and hand-rolled overlays against the merged chain
  before writing any further migration plan.
- **137-C — `formatPercent` migration WON'T-DO as specced**: it does `value*100`
  (expects a ratio) but the ~20 call sites hold percent-scale numbers with bespoke
  sign handling. Needs a percent-scale variant + sign audit, not a drop-in.
- **132 — vault-key rotation on device revocation** (deferred security spike): a
  revoked device that already captured ciphertext can still decrypt THAT (future
  data is cut off by per-device auth). Needs 131's `/keys` machinery; 131's
  `ade8e99d` ECDH helpers are groundwork, so it's cheaper now than when deferred.
- **EntryDrawer 商家 autocomplete** (from plan 180, 2026-07-13): the merchant
  autocomplete shipped on QuickAdd only; the CashFlow EntryDrawer 商家 field is
  still a plain input. Small plan — extract/reuse QuickAdd's dropdown.
- **Annual-report print — deferred polish** (from plan 173, 2026-07-13): (a) the visual print-preview check was never eyeballed (headless executor) — operator should print `/reports/annual` once (dark theme + a long multi-year report) to confirm no chrome bleed / no year-row page splits; (b) the 列印 button is not gated off on iOS (`window.print()` works in iOS WKWebView but is unpolished) — gate to desktop if the report becomes a mobile surface. Small.
- **Quick Add §6 remaining UX items** (from plan 175 inventory, 2026-07-13): §6.2 輸入框 token 高亮 (NOT shipped — needs an input overlay, bigger UI effort) and §6.3 低信心即時預覽補救 (PARTIAL — confirm-card chips exist, no preview-stage remediation). Both offline; a follow-up plan when Quick Add next gets attention. §6.6 語音輸入 stays with the iOS wave.
- **Quick Add Tier 2 (cloud parse) — PARKED by operator** (2026-07-13): the §12
  decision draft stays in `docs/quick-add-nlp-plan.md`; operator chose not to
  build for now (Tier 0+1 suffice). Do NOT build unless explicitly re-approved
  — it crosses the local-first invariant.
- **Index-Nudge — full-history evaluation** (from plan 179, 2026-07-13): the
  shipped nudge evaluates over the SELECTED analytics period, so it can only
  fire on 5Y/All/long ranges (needs ≥8 rolling quarters in-window). If the
  operator wants it to fire regardless of the viewed period, a small follow-up
  computes the windows from an always-full-history TWR series. (The A/B/C
  variant decision itself is CLOSED — operator chose A+TWR, shipped in 179.)
- **分帳 (counterparty shares) — phase 2, now plan-able** (updated 2026-07-13):
  多類別 shipped (181/182 merged). 分帳 adds a `"share"` legKind + counterparty
  per leg, reusing 代墊/AR-AP. Plan it once the operator's live pass on the 182
  split flows is done.
- **DRIP / fee-leg / installments lack partial-sync-arrival guard** (surfaced by plan 176 spike, 2026-07-13). Sync is per-record LWW with no group-atomic apply; only **transfers** detect a half-arrived group (`incompleteTransferGroupIds`, `ledgerTrust.ts:151-165`). A device that pulls one leg of a DRIP pair before its sibling transiently shows wrong cost-basis/XIRR until the other arrives. Fee-leg/installments are more benign (each row self-consistent). Fix = generalize the transfer guard to `incompleteGroupIds` covering `dripGroupId`; small, worth a plan when sync/DRIP next gets attention. Not a live-data-corruption bug (self-heals on next pull), so P3.

## Deferred by design (decide-then-build)

- **085 / 086 / 087** — SwiftUI Widget + App Intents; design pinned in 085, awaiting
  your simulator-vs-$99 decision + the Tauri-regeneration spike.
- **088 Phase 7.2** — on-device AI features; Feature B (monthly summary) shipped as
  089. Feature A (transaction auto-categorization) is now **largely addressed**
  (reconciled 2026-07-13): entry-time categorization = lexicon + Tier-1 FM in
  QuickAdd; retroactive = plan 174's suggest-and-confirm bulk tool. Residual
  delta = FM-model-powered categorization for merchants the lexicon has never
  seen — keep product-gated, likely not worth building separately.
- **077 small gaps** — Phase 3.2 iOS lifecycle sync listeners
  (`visibilitychange`/`tauri://resumed`, touches AppShell, GUI-verify); Phase 7.4
  Writing-Tools check (trivial verify). Both small.

## Manual / operator-only verification outstanding (code already shipped)

- **182 split flows live pass** (2026-07-13): add 2-leg + 3-leg split, edit
  (re-save twice — tombstone+recreate round-trip), remove to 1 leg → plain-form
  exit, delete group, list expand/collapse, 收支 totals + 分類 chart match legs,
  credit-card split with 延後入帳.
- **180 Quick Add live pass**: merchant autocomplete dropdown (keyboard nav,
  Escape closes dropdown not QuickAdd), 「晚餐 50嵐 120」 merchant/name split.
- **179 nudge visuals**: 口徑 labels on the Alpha card + Dashboard strip; the
  banner needs 5Y/All + real lagging data to appear.
- **173 print preview**: `/reports/annual` 列印 — dark theme prints
  dark-on-white, no chrome bleed, no year-row page splits.
- **156–163 motion device QA** (chain now merged): overlay enter/exit, toast
  swipe/pause, ⌘K instant, segmented slide, privacy scroll+blur, bottom-sheet
  drag, EntryDrawer exit, real haptics on an iOS build.
- 2-device **pairing + revocation** (131/132) — worker deployed + 25 tests; needs 2 real phones.
- **macOS GUI eyeball** — title bar / app menu / Dock badge / window restore (079).
- **Live per-route 390px QA pass** — the static RWD audit missed the nav + date-strip
  bugs found live (084); other routes may have similar live-only issues.
- **Tauri spot-check of 151/152** ticker search (historic dev-proxy 502 blocker
  is now FIXED in vite.config.ts, so the browser dev shell works too).

## Findings considered and rejected (do NOT re-flag)

*(This ledger is the anti-re-audit record — kept verbatim.)*

- **Analytics usefulness review** — addressed by plan 167 (global period control + 5-section reorder, merged in v0.1.0-alpha.57) and the 2026-07-12 direction audit found no further analytics-direction gap worth planning; retired (was an Open follow-up).
- **RecurringRulesTab free-text category** — ADDRESSED by plan 174 (structured chip picker, merged 2026-07-13); retired from Open follow-ups at reconcile.
- **Vite dev-proxy 502** — FIXED independently (vite.config.ts:93-95 now parses `request.url` with a base URL; verified at reconcile 2026-07-13); retired from Open follow-ups. Browser dev shell market-data proxy works again.
- **Index-Nudge variant decision** — CLOSED: operator chose A + repoint-to-TWR (2026-07-13), shipped as plan 179. Only the full-history-evaluation follow-up remains open.
- (P3) Dashboard card-heaviness: flattening cards needs a significant visual redesign across DashboardRoute. A dedicated design sprint, not an incremental plan.
- Sidebar width transition in AppShell.tsx: intentional structural animation, not a data-driven bar. Not a layout-thrashing issue.
- `InvestmentsRoute.tsx:1339`/`1448` `hover:bg-black/5 dark:hover:bg-white/5`: impeccable 偵測器 flag 為 pure-black background — 誤報，是合法的列 hover 微調，非 scrim。107 明確排除，勿再掃出。
- Dashboard KPI 卡的 4px 色籤（`KpiCard`, DashboardRoute.tsx:1370）曾疑似 side-stripe 反模式 — 查證為圓角 pill 元素（非 border-left），屬允許寫法，不修。
- QuickAdd FAB 蓋到 Dashboard 圖表右下（375px）— 標準 FAB 行為，demo 資料下才明顯，影響低，不值得做。
- **137-C — `formatPercent`**: see Open follow-ups (WON'T-DO as specced).
- "DESIGN.md prescribes SwiftUI" — mis-attributed by a subagent; the line is in the known-stale `.impeccable.md:17`, not DESIGN.md. DESIGN.md is accurate.
- TransactionsRoute 「JANUARY 2026」English month header (`transactionsTxLabel`-adjacent, ~:643) — intentional: explicit eslint-disable + comment; matches the English-eyebrow convention. Not stray i18n.
- QuickAdd editable-input `toLocaleString` (~:261) and NumberField/FIRECalculator input formatting — inputs are exempt from the privacy-mask rule by convention (you can't mask a field mid-edit). Only DISPLAY chips were planned (137-E).
- Direct `getFinanceRepository()` calls in 10 files — mostly legitimate imperative one-offs (demo mode, export, device connect); not worth a consolidation plan.
- TypeScript 7 / ESLint 10 / worker-types v5 majors — track, don't migrate; all runtime deps are current-major. Batch the ESLint ecosystem when it's actually needed.
- Sortino/Sharpe/MaxDrawdown KpiCard ACCENT colors using pos/neg (AnalyticsTab :843/:861) — metric-quality cues, not price direction; the gain/loss litmus does not apply. Recorded in plan 134 as leave-alone.
- worker CORS `*` — re-confirmed fine (Bearer auth, no cookies). Standing rejection from the June audit.
- "Custom assets have no entry UI" (original DIR-04 wording) — STALE at vetting: InvestmentsAddSheet:304 creates `assetType:"custom"` and HoldingEditModal logs manual prices. Only the staleness data-health rule remained → plan 141 re-scoped.
- `next-themes`/`react-hook-form`/`@tanstack/react-table` — verified zero imports; removed in plan 139 item 6.
- Dead COSS primitives (coss/checkbox|field|label|select, 0 importers) — intentional scaffolding for the deferred form-primitive migration; plan 139 documents them instead of deleting.
- `components/ui/` "dual component stack" — largely by-design per `src/components/ui/README.md`'s whitelist (command/popover/date-picker have no COSS counterpart); only the migration-plan doc's "COMPLETE" wording drifted → folded into plan 139.
- NotificationCenter/FilterPill/SegmentedControl small `rgba(0,0,0,…)` shadows and CashFlow/QuickAdd active-chip `rgba(0,0,0,0.12)` borders — subtle elevation/edges, not scrims; excluded from plan 136.
- `InvestmentsRoute.createSnapshot/deleteSnapshot` invalidating only `["manualPriceSnapshots"]` (narrower than HoldingEditModal's siblings) — investigated during plan-124 execution: NOT a gap. Custom-asset valuation re-derives at render from the invalidated `manualPriceSnapshots` query; the extra sibling keys are defensive redundancy, not required. Do not "fix".
- Session-finding leave-alones (motion batch): QuickAdd `overlayLeft` 64/240 hardcode (plan 153, deliberate); charts `isAnimationActive={false}` + un-animated KPI numbers (correct for finance data); global `:active{translateY(1px)}` press nudge (deliberate macOS choice); `windowEffects:["mica","sidebar"]` mica-on-macOS (harmless until a Windows build); JS `onMouseEnter` hover on touch in 6 files (deferred, per-site judgment on chart tooltips — noted in 156).

## 190–191 — 帳本 Phase 2 (發票/營業稅, planned at `41d44e04`, 2026-07-13)

Phase 2 from docs/ledger-books-plan.md §3, split foundation+UI like Phase 1
(188/189). Operator decisions baked: Model A tax (tax fields on `invoices`
table ONLY, not LedgerTransaction), generic 字軌+序號 numbering w/ TW 統一發票
preset, 客戶主檔 + 帳齡 + DSO in scope, 401 = live query. Sync wiring now a
known playbook (188's 4 files + 2 outbox arrays).

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 190 | Phase 2a foundation — `Invoice`+`Client` entities, `salesTax.ts` (round(含稅×5/105)) + `invoiceNumbering.ts` (TW 統一發票 preset) pure modules, full sync wiring (mirror 188's book playbook), `stampInvoiceSettled`, dual-harness + characterization. Zero UI, no LedgerTransaction change. | P2 | L | 188+189 (merged) | DONE — reviewed+APPROVED, branch `feat/ai-invoices-foundation` @ `a35e4ff3` (5 commits, off `41d44e04`). NOT merged — awaiting operator. `Invoice`+`Client` entities; `salesTax.ts` (round(105000×5/105)=5000 ✓) + `invoiceNumbering.ts` (TW 字軌 `^[A-Z]{2}\\d{8}$` + 8-digit increment + overflow guard) pure modules; sync wiring EXACT parity w/ book (invoices=8/clients=8/books=8 grep); `stampInvoiceSettled`/`findInvoiceByLedgerId`; +36 tests (1214 total); characterization byte-frozen; **LedgerTransaction unchanged (verified)**. Reviewer-confirmed design: tax fields on `invoices` table ONLY. ⚠ SURFACED: snapshot round-trip gap → plan 192 (188 SQLite-export-drops-books regression + invoices/clients not in backup). |
| 192 | Snapshot round-trip fix (P1 data-integrity) — SQLite `exportSnapshot` omits `books` (188 shipped regression: desktop backup/restore silently drops books) + add invoices/clients to `RepositorySnapshot` + all 4 export/import paths; round-trip test first | P1 | S | 190 MERGED | DONE — reviewed+APPROVED, branch `fix/ai-snapshot-roundtrip` @ `f20ea5dc` (off `e1e3c3b0`). NOT merged — awaiting operator. Round-trip test FAILED pre-fix (SQLite lost company book, browser lost client — both gaps proven), passes post-fix; asserts book id/kind/toggles/color + client 統編 + invoice 號碼/稅額. Fix: SQLite exportSnapshot += books (188 regression) + invoices/clients through all 4 export/import paths + `RepositorySnapshot` type; `?? []` guards (normalizeStoredData 5346-5354) keep pre-190 snapshots importable. Only repositories.ts + new test touched; no entity shape/UI change. tsc 0 / lint 0 / 1216 tests. |
| 191 | Phase 2b-1 UI — 開發票流程 (extends `ar`, auto tax via computeSalesTax, TW 字軌 preset), 客戶主檔 + ClientAutocomplete, wire `stampInvoiceSettled` into `confirmSettle`, `invoiceEntry.ts` pure helper. Company-book-gated. | P2 | L | 190+192 (merged) | DONE — reviewed+APPROVED + LIVE-VERIFIED (integrated w/ 194), branch `feat/ai-invoice-entry` @ `14d82459` (off `50419301`). 開發票 toggle on `ar` (company-book-gated), `invoiceEntry.ts` pure helper (105000→未稅100000/稅5000 ✓), ClientAutocomplete+ClientManager, create-ledger-then-invoice w/ orphan-safe ordering + `InvoiceMetadataError` toast, `stampInvoiceSettled` in confirmSettle (verified no-op for plain 應收). tsc 0 / lint 0 / 1227 tests. Combined steps 2-5 into 1 commit (documented, sound). Live-verified (ar drawer + company-gate). MERGED to main @ `51cf90ed`. |
| 194 | Fix 189 regression — `bookScope.scopeRows` drops unsettled 應收/應付 (`accountId:""`) from 未結清 in EVERY book view incl. 總帳 (found by 191 executor). One-line filter widen + test. | P1 | S | — | DONE — reviewed+APPROVED, branch `fix/ai-bookscope-unsettled` @ `d2a20c41`. One-line `scopeRows` widen (`!row.accountId || …`) + test (fails pre-fix `l_ar_unassigned` missing, passes post). tsc 0 / lint 0. LIVE-VERIFIED (未結清 shows the accountId="" row). MERGED to main @ `51cf90ed`. |
| 193 | Phase 2b-2 reporting — `invoiceReporting.ts` pure math (agingBuckets/DSO/outstandingSalesTax/bimonthly401Summary) + 3 company-book-gated CashFlow cards (帳齡+DSO, 本期應繳營業稅, 401 雙月彙總). Completes Phase 2. | P2 | M | 190+191+194 (merged) | DONE — reviewed+APPROVED (1 revision: aging buckets) + LIVE-VERIFIED, branch `feat/ai-invoice-reporting` @ `f4b7aac8`. `invoiceReporting.ts` (agingBuckets 5 real buckets 未到期/1-30/31-60/61-90/90+, DSO, outstandingSalesTax, bimonthly401Summary) +17 tests; 3 company-gated cards. **REVISE fixed finance-correctness bug: a 15-day-overdue invoice was labeled 未逾期 — now correct 逾期1-30.** MERGED to main @ `da6c993c`. tsc 0 / lint 0 / 1245 tests. **LIVE (reviewer): company book → 開發票 (105000 含稅 → 未稅100000/稅5000, TW字軌 AB12345678) → 帳齡「未到期 1筆 105,000」+ 應繳營業稅卡 + 401表 all render; 開發票/客戶 buttons company-gated.** NOT merged — awaiting operator. Completes 帳本 Phase 2. |

## 195 — 共享帳本 spike (Phase 3 gate, operator chose "spike now" 2026-07-13)

帳本 Phase 2 COMPLETE (188–194 all merged @ `da6c993c`). Phase 3 (shared
books / 雙向共寫) is a HIGH-risk crypto+worker surface; operator chose to run
the design spike now and decide the build later. **143 SUPERSEDED by 195**
(143 predates books + references the pre-books account-sharing model + the
then-unbuilt 130–132 crypto foundation, which has since SHIPPED).

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 143 | Household sharing spike (pre-books, account-level) | P3 | M | — | SUPERSEDED by 195 (books-aware rewrite; 143 designed against account-`isSharedToHousehold` + unbuilt 130–132; obsolete) |
| 195 | 共享帳本 key/membership spike — book-key wrapping (builds on SHIPPED pairing/secretStore/vault + worker ECDH), membership/revocation, worker namespace delta, 雙向共寫 conflict UX, phased Phase 3/4 outline → `docs/shared-books-plan.md`. Doc-only. | P3 | M | 186 §4 (merged) | DONE — reviewed+APPROVED (doc-only), branch `feat/ai-shared-books-spike` @ `378c0e0f` (`docs/shared-books-plan.md` 663 lines, 7 sections; re-verified vs SHIPPED pairing/secretStore/vault + worker 0001-0007). **Recommends: Book Space Key** (per-book AES-GCM-256 wrapped to member devices via existing ECDH, zero new crypto primitives) + **mandatory rotation on member removal**; removed member keeps pre-removal data (locked honest answer); worker `0008` +3 additive tables, per-book relay_sequence. Found dead household/devices stubs (README-only). Phase 3 read-only=M, Phase 4 雙向共寫=XL. *
