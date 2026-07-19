# Implementation Plans

## Reconciled 2026-07-18 (`main` @ `9119cb8e`)

- **227 (編輯轉帳) is MERGED** — the background session merged `fix/ai-transfer-edit`
  @ `9119cb8e` (row below was stale at "awaiting operator merge"; now corrected).
- **Merged batch 223–227 re-verified on HEAD**: gates green — tsc 0 / lint **0 errors**
  (761 warnings, the plan-225 baseline) / **1373 tests** / 125 files. Artifact greps
  all present: `domain/todoRows.ts` (223), `lockCount` ref-count (224),
  `from:"reconcile"` across router+Reconcile+CashFlow (225), `planFeeLegUpdate` (226),
  `updateTransfer` + `editingTransferGroupId` + 6 `setEditingTransferGroupId` clears
  incl. the openCreate/startDuplicate symmetry the review added (227).
- **main is ~6 commits ahead of `origin/main`** (223–227 batch + this reconcile) —
  push pending, operator's call.
- **Stale branch safe to delete**: `fix/ai-transfer-edit` (merged at `9119cb8e`).
- **No BLOCKED / IN-PROGRESS plans; no drifted TODOs.**

## 228–230 — DCA Option A build batch (`/improve plan` @ `fd4af91f`, 2026-07-18)

Operator chose **Option A (rework & re-enable)** from `docs/dca-decision.md`.
The doc's §6 worklist (8 items) turns into these 3 plans — because 2 items were
already-resolved-in-code (no work) and 1 needs an operator decision (below).

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 228 | Re-enable the DCA tab, **books-scoped** — add 定期定額 to InvestmentsRoute tabs array (union+render branch already wired), filter `RecurringInvestmentsTab`'s rules by `switcherAccountIds.has(r.accountId)` (the operator-decided 公司/個人 scoping, mirrors DashboardRoute:798-806), fee-preservation regression test, ROADMAP flip, 1 demo seed rule | P2 | M | — | TODO |
| 229 | Restore the dashboard DCA reminder as a **待辦 source** (not a separate card) — add `dca` type + `dcaRules` source to `domain/todoRows.ts` (plan 223's maintenance note explicitly anticipated this), books-scoped 30-day upcoming list in DashboardRoute, row links to `/investments?tab=recurring` | P3 | S | **228** (tab must exist to link to) | TODO |
| 230 | DCA post-time **stale reference-price** guard — the one real semantic gap: posting uses a static 參考價 typed once, no staleness check. Post button → confirm dialog showing stored 參考價 vs latest loaded quote (`buildQuoteLookup`/`findQuoteForTicker`), offers 用參考價 or 更新為最新報價並記錄 (update-then-post). Posting math untouched | P3 | S–M | **228** (tab must be reachable) | TODO |

**Recommended order**: 228 → (229 ∥ 230, both independent, both need 228 merged).

**Worklist items NOT planned, and why** (from `docs/dca-decision.md` §3):
- **Reminder-vs-auto-post** (§3.1) — ALREADY the shipped model (manual one-tap
  post; no auto-scheduler exists). No work. *If the operator ever wants full
  auto-post like cash rules, that is a NEW M-effort feature (new code path +
  market-closed/stale-price story) — a separate decision, not "finishing" DCA.*
- **By-amount-vs-by-shares** (§3.2) — both modes already in the type + UI toggle
  (`RecurringInvestmentsTab.tsx:257`). No work.
- **⚠ Fractional-share / lot-size rounding** (§3.4) — **NEEDS AN OPERATOR
  DECISION before it can be planned.** `quantity = amount / price` (fixedAmount
  mode) is unrounded; TW brokers commonly need whole/1000-share lots (零股 has
  its own fee schedule). Question: should Northstar **round** `quantity` to a
  lot, or **record the exact fractional share** (arguably more correct for
  cost-basis even if the real order was rounded)? Recommendation: record
  fractional (cost-basis fidelity), add an optional display note. Once decided,
  it's an S plan touching `recurringInvestmentToDraft` (`repositories.ts:6482`).

## 142 — DCA spike DONE + branch cleanup (2026-07-18, `main` @ post-merge)

- **142 (DCA finish-or-retire spike) executed + reviewed + MERGED** — doc-only,
  `docs/dca-decision.md` (335 lines). Recommendation: **Option A (rework & re-enable)**;
  the posting path is fully built+tested (reminder + manual one-tap post, NOT auto-post
  — verified: no `postDueRecurringInvestments` scheduler exists), only stale reference-price
  handling is a real gap. 8-item S–M worklist in the doc's §6. **Operator's finish/retire
  call is now unblocked.**
- **Branch cleanup**: pushed main to origin; deleted 12 fully-merged `feat/ai-*`/`fix/ai-*`
  branches (motion 214–218, autocomplete/nudge/share-legs 219–221, UX 223–226) +
  the DCA spike branch. `feat/ai-ga-motion-spike` deliberately kept (unmerged 161 spike;
  its `docs/motion-ga-spike.md` lives only on that branch). `fix/ai-transfer-edit` was
  never local (background session's worktree).
- **Next open items**: the DCA Option-A worklist (if operator chooses to finish) + the
  Open follow-ups list further down. No plan is blocked.

## 227 — 編輯轉帳 duplicate-pair bug (found by 225's executor, verified @ `93ee4103`; planned @ `9ece3bde`, 2026-07-18)

Editing a transfer is silently destructive: the detail panel offers 編輯交易 on
transfer rows (`TransactionDetailPanel.tsx:322`), but `startEdit` hydrates
`ledgerForm` only (transfer drawer opens empty/stale) and `submitTransfer`
always calls `createTransfer` — **saving mints a duplicate transfer pair while
the original stays**; balances double-move. Reverse direction broken too
(type tabs live while editing → 轉帳 tab on an expense edit creates + strands).

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 227 | 編輯轉帳 — new repo `updateTransfer(groupId, TransferDraft)` (**in-place leg update**, NOT updateSplit's tombstone+recreate: leg ids + `isReviewed`/`postDate` must survive — reconcile stores state ON legs), fee-leg reconcile table (mirrors 226), UI hydrates `transferForm` by groupId lookup (deep-link rows carry no `transferPair`), `editingTransferGroupId` state, `changeType` guards both hazardous directions. ≥7 dual-harness tests incl. the no-duplicate regression + atomicity | P1 | M | — (226 touches the same files — coordinate merge order; disjoint regions) | **DONE — executed+reviewed, awaiting operator merge.** Branch `fix/ai-transfer-edit` @ HEAD. 16 dual-harness tests (8 情境 × 2 harness; 1341→1357), tsc 0 / lint 0 errors. Review fix folded in: executor omitted the `editingTransferGroupId` clears in `openCreate`/`startDuplicate` (the `editingSplitGroupId` symmetry) — stale state would have turned 複製轉帳 into an update. Live-verified in demo mode: edit hydrates, save 800 → ONE pair (27 筆 not 28), re-edit shows 800, fee 0→15→0 creates/hydrates/removes the 手續費 row, type tabs inert in BOTH directions. (Sonnet executor stalled at step-5 browser phase; advisor completed verification directly.) **MERGED @ `9119cb8e`** (background session, reconciled 2026-07-18; re-verified green at HEAD: 1373 tests). |

Interim mitigation option (operator's call, not in the plan's steps): hide
編輯交易 for `entryType === "transfer"` rows — 複製 (`startDuplicate` is
correct) + 刪除 (groupId cascade) remain as the workaround.

## 219–221 — follow-up batch (operator-selected from Open follow-ups, 2026-07-17 @ `55c636ac`)

Operator picked #1 (worktree/Tailwind — **done directly**, `55c636ac`: gitignore
`.claude/worktrees/` + `git worktree remove busy-mestorf`), #2, #5, #8 from the
Open follow-ups list. 分帳 (#8) follows the 181→182 precedent: 221 = data-layer
foundation now; **222 (分帳 UI) is cut only after 221 lands**, against its real
signatures. ⚠ 182's operator live pass (Manual-verification section) is still
outstanding — do it before or with 222, not later.

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 219 | Shared `MerchantAutocomplete` — extract QuickAdd's (kb-nav + aria, plan 180) into `components/`, adopt in EntryDrawer, delete the weak local copy + `buildMerchantSuggestions`. **Corrects the stale follow-up**: the drawer was never a plain input (own autocomplete since `60ac6277`); the real gap is keyboard nav/a11y/dedupe | P3 | S | — | **DONE — reviewed+MERGED** @ `5a34af05`. Live-verified in drawer: 「全」filters 全家/全聯, ArrowDown+Enter selects, Escape closes dropdown NOT drawer. Accepted deltas: cap 12→8, exact-value hidden. |
| 220 | Index Nudge full-history evaluation — nudge verdict from `"1900-01-01"` TWR+benchmark (period-independent), alignment extracted to `domain/indexNudge.ts` + 4 tests, banner 口徑 line updated; view's Alpha card untouched; params/copy operator-locked | P3 | S–M | — | **DONE — reviewed+MERGED** @ `5b2e40a1`. +4 tests (1322). Executor correctly flagged two of my done-criteria greps as imprecise (fallback branch keeps its own unrelated `benchByDate`; `1900-01-01` appears 5× not 2× — the plan's own code adds 3). Residual: `perf.nudgeInput` now unconsumed (harmless; remove when the perf memo is next touched). |
| 221 | 分帳 foundation — `legKind: "share"` legs on the split model: builder `shares` param (對象→`name`, required `counterAccountId` = 代墊 pass-through, expense-only), repo `createSplit/updateSplit(shares?)` + counter-account guard, `incompleteSplitGroupIds` counts category+share, **reconciliation test** (bank −1000 / 應收 +600 / expense 400). Zero UI | P2 | M | — | **DONE — reviewed+MERGED** @ `98dd6ee9`. +16 tests (1338 total), reconciliation test green on BOTH harnesses — `deriveAccountBalances` (ledgerTrust.ts:106-136) already posts the pass-through, no new mechanism. Signatures for 222 recorded in the executor report + plan's maintenance notes. **222 (分帳 UI) is now cut-able**; do the outstanding 182 live pass with it. |

Key semantics locked in 221 (from the 176 spike + reconciliation identity): a
share IS a receivable (`counterAccountId` pass-through, neutral to spend); a
請客 portion is not a share leg, it stays in the payer's own category legs —
so bank moves by the full paid amount, expense only by the payer's share.

## 223–226 — operator UX batch #3 (reported live, `/improve plan` @ `3b857c73` + `af28266e`, 2026-07-17)

Operator went to do 信用卡對帳 and the bill was invisible. Root cause confirmed
at `DashboardRoute.tsx:816-894`: plan 164's 待辦 merge stacked THREE silent
truncations (recurring `.slice(0,5)` + AR/AP `.slice(0,5)` + merged `.slice(0,6)`)
with no 查看全部 — a card reminder dated beyond the 6 nearest items is
unreachable, and with it the card's link to `/cash-flow/reconcile/$accountId`
(the only other entry is AccountsRoute:496's small icon). 222 stays reserved
for 分帳 UI (cut after 221's live pass).

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 223 | 待辦「查看全部」— merge logic → pure `domain/todoRows.ts` (uncapped, +4 tests incl. the pushed-out-card regression), card keeps 6-row pulse + footer 「查看全部 N 筆 →」 opening a ModalShell with ALL items (same row links); removes the per-source pre-caps (fairness fix) | P1 | M | — | **DONE — reviewed+MERGED** @ `defe774c`. Modal modeled on ClientManager's `variant="center"` pattern; shared `TodoRowItem`; regression test proves a card beyond 7 nearer bills survives. Live-smoked: card renders, footer correctly hidden at ≤6, 0 console errors (demo data can't stably exceed 6 — recurring engine auto-posts due bills on load; unit test carries the >6 case). |
| 224 | Ref-count `lockViewportScroll` — 對帳→編輯 round-trip strands `overflow:hidden`: ModalShell's exit-motion delay (plan 157) makes release non-LIFO, drawer captures "hidden" as its restore value. First-acquire locks / last-release restores / idempotent handles; +3 tests incl. the interleave regression. API unchanged, zero call-site edits | P1 | S | — | **DONE — reviewed+MERGED** @ `c11d9310`. Executor rightly rewrote the old test that documented the buggy out-of-order behavior as a "known limitation", and fixed a leaked handle in the first test (fatal under module-level count). 8/8 suite. |
| 225 | 對帳→編輯交易 round-trip — `from: "reconcile"` search param (schema `router.tsx:62`), ReconcileRoute:366 passes it, CashFlow's panel-close/edit-save/delete paths call `returnIfFromReconcile()`; duplicate deliberately stays. Dashboard todo links unaffected (no `from`) | P1 | S–M | — (224 independent) | **DONE — reviewed+MERGED** @ `9ece3bde`. 6 finish-paths wired (incl. recurring-scope prompt tail in `applyRecurringScope` — waits for this/future/all to resolve, fires once). Lint 762→761: helper now uses the previously-dead `navigate` (baseline improvement). ⚠ **Executor surfaced + advisor verified a pre-existing bug: transfer editing is broken** — detail panel offers 編輯交易 on transfers but `submitTransfer` always `createTransfer`s (duplicate pair, form not hydrated) → spun off as background task `task_e19c9aed` (running in a separate session). Installment-delete's own prompt flow deliberately not wired (not a plan-named finish path). |
| 226 | 手續費 editable on edit — lifts the recorded deferral (`CashFlowRoute.tsx:913-916`): repo `updateLedgerTransaction` reconciles the linked fee leg (create/update/tombstone per Design table, groupId+手續費+legKind-null lookup, `bump()` discipline), UI drops `!editing` gate + hydrates from the leg. Transfers/installments/splits out of scope. ≥5 dual-harness tests | P2 | M | — | **DONE — reviewed+MERGED** @ `78f911a2`. Shared `planFeeLegUpdate` decision fn; SQLite override mirrors 1:1 in one `withTransaction`; `feeAmount === undefined` = no-opinion is the fan-out guard — proven by the scope="all" test (sibling fee legs untouched, merchant propagates). 12 new tests (6×2 harnesses), 1353 total. Provenance note: first executor died to a session limit (partial discarded), the user-interrupted second dispatch had completed the work uncommitted; third executor line-by-line verified it against the plan before committing — advisor re-reviewed the full diff + re-ran gates. |

**Also recorded (2026-07-17)**: plan 142's Option A books-scoping question is
**operator-DECIDED** — DCA rules follow their target account's book (公司帳 view
never shows 個人帳 rules; same rule as the dashboard `upcoming` memo's
`switcherAccountIds` filter). Written into plan 142; the spike doc records it
instead of re-asking.

## Reconciled 2026-07-17 (`main` @ `cb1d5004`)

- **214–218 done-criteria re-verified by grep at HEAD** ✓ (`ns-notif-panel` in css+component;
  `ns-banner-collapse` css+Dashboard; `ns-expand-in`/`ns-caret-rotate` present, 0 caret swaps
  left in the 3 converted files; 0 `cubic-bezier` in tsx, 0 `transition: "left"`;
  `ns-onboarding-*` css+component). Also re-verified: 213 (0 raw close buttons), 212
  (fix intact — **drifted to `globals.css:750`**, the motion batch inserted ~50 lines above).
- **Corrected four stale "NOT merged" claims** (verified `git merge-base --is-ancestor`):
  **200** (`1f171585`), **196** (`b64b90fe`), **197** (`b0adf8e5`), **195** (`378c0e0f`)
  are ALL ancestors of `main`. The 2026-07-15/16 sections already said so; their own
  section rows still contradicted them — now fixed. 202's stale TODO row likewise.
- **161 spike still correctly NOT merged** (`46b00892` not an ancestor); reminder:
  `docs/motion-ga-spike.md` exists ONLY on that branch.
- **142 (DCA spike) drift-checked — still valid TODO**: DashboardRoute still hides
  定期定額提醒 ("until the DCA workflow is finalised" comment intact),
  `RecurringInvestmentsTab.tsx` still present-but-gated.
- **⚠ Dead executor worktree found, with a build side-effect**: `.claude/worktrees/
  busy-mestorf-dd21b7` (detached @ `9374ee9f`, clean, fully merged — zero unique work).
  Plan 217's executor proved it leaks into builds: **Tailwind v4 auto-source scanning
  respects .gitignore, and `.claude/worktrees/` is NOT gitignored** (`.claude/skills/` is),
  so stale worktree files emit dead utility classes into compiled CSS. Operator remedy
  (advisor can't mutate): `git worktree remove .claude/worktrees/busy-mestorf-dd21b7`
  and add `.claude/worktrees/` to `.gitignore`.
- **Executable right now**: nothing BLOCKED; TODO backlog = 142 spike + Open follow-ups
  below. `main` is ~13 commits ahead of `origin/main` (the 214–218 batch) — push pending,
  operator's call.

## 214–218 — motion audit round 2 (`/improve-animations` @ `ae708c1b`, 2026-07-17)

Second pass after the 156–163 motion batch. Round-1 hygiene held up: zero `ease-in`,
zero `scale(0)`, zero hot-path `transition: all`, overlays/toasts all interruptible
transitions. Round 2 is feedback gaps + cohesion.

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 214 | NotificationCenter panel enter/exit motion — the last teleporting anchored surface; `@starting-style` enter (origin top-right, scale 0.97) + `data-closing`/`transitionend` exit, mirroring ModalShell | P2 | S | — | **DONE — reviewed+MERGED** @ `c014144b`. Review fix: `requestClose` → `useCallback` + `closingRef` guard (executor's plain function added an exhaustive-deps warning; lint back to 762 baseline). Live-verified in browser: origin top-right, exit unmounts, spam-toggle never strands. |
| 215 | Dashboard banner dismiss collapse (`1fr→0fr` grid-rows + opacity) — kills the 50px content jump on the most-visited page; entrances stay instant | P2 | S | — | **DONE — reviewed+MERGED** @ `0e9a09a9`. Review fix: executor's wrapper rendered EMPTY on fresh healthy profiles (`healthy && !hasAnyData`) → phantom 14px gap, live-confirmed then fixed by hoisting the condition. Live-verified dismiss: below-content moves exactly 56px (42 + 14 margin), persistence intact. Executor deviation accepted: wrapped the whole plan-209 ternary (both banner variants), correct read. |
| 216 | Expand/collapse cohesion — rotating caret standardized across 5 sites (3 hard-swap `CaretRight↔CaretDown` today) + `.ns-expand-in` content enter on holdings rows & reconcile periods; NO height animation | P2 | S | 214 lands its globals.css block first (adjacent edits, trivial conflict) | **DONE — reviewed+MERGED** @ `9d26765e`. Live-verified: caret rotates 0→90 (150ms token), expansion enters via `@starting-style`, collapse instant. `CaretDown` imports pruned in all 3 converted files. |
| 217 | Motion hygiene batch — RecurringRules toggle `left`→`translateX(14px)`, QuickAdd hardcoded bezier → `var(--ns-ease-out-strong)`, legacy `ui/button` `transition-all` → property list (transform excluded: instant press nudge is a settled decision), AppShell sidebar `0.2s ease` → tokens | P3 | S | — | **DONE — reviewed+MERGED** @ `c7d140b7`. +addendum: executor's done-when grep caught a 5th site my census missed — `TradingFeesSection.tsx` toggle had the identical `transition: left` pattern (fixed, 16px travel). `grep cubic-bezier src --include='*.tsx'` → empty. |
| 218 | Onboarding entrance + step-transition motion (first-run delight budget; enter-only, `key={step}` remount + `@starting-style`) | P3 | S | — | **DONE — reviewed+MERGED** @ `24565c49`. Executor deviation accepted: the four `step===N` ternaries had NO shared container — it introduced the wrapper div (presentational only; verified no `useState` below the key, file-input value already self-clearing). Live-verified step 1→2: remount fires enter, layout intact. |

**Recommended order**: 217 (mechanical, zero risk) → 214 → 215 → 216 → 218. All are
Sonnet-executable; 214 has the most moving parts (exit-state machine).

**Batch executed + merged 2026-07-17** in that exact order, one branch per plan
(`fix/ai-motion-hygiene`, `feat/ai-notif-panel-motion`, `feat/ai-banner-dismiss-motion`,
`feat/ai-expand-collapse-motion`, `feat/ai-onboarding-motion`), Sonnet executors +
Fable review. Every plan: tsc clean / lint 0 errors 762 warnings (baseline) / 1318 tests.
Browser feel-checks ran against the Vite dev server (demo mode); note for future sessions:
the browser-pane tab throttles transition clocks, so mid-transition computed-style samples
read as frozen — verify end-states + computed `transition` properties instead, or screenshot.

**Vetted non-findings this round (do not re-flag)**: COSS Select popup opens with no
animation — correct, it mimics macOS native menus (`alignItemWithTrigger`, instant);
⌘K/GlobalSearch `duration-0 animate-none` deliberate (plan 160); KPI numbers + charts
un-animated deliberate (finance data); global instant `:active` 1px press nudge settled;
segmented-thumb `width` transition left alone (tiny element, `will-change`, plan 160).
**Noted, not planned**: sidebar collapse animates whole-app grid layout (inherent to
push-sidebar; only revisit if device QA shows jank — see plan 217 §D note); global
reduced-motion rule zeroes ALL transitions incl. opacity feedback (Emil's bar says keep
opacity fades — defensible simplification, revisit only if a11y feedback asks);
scattered magic durations (`.12s/.15s`) in route inline styles — too diffuse to batch,
fix opportunistically when touching those files.

## 202 / 213 — modal close button unification (2026-07-16)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 202 | Extract `<ModalCloseButton />`, replace the hand-built close buttons (six treatments: 3 hit sizes / 3 icon sizes / 3 hover languages) | P0 | M | — | **DONE — reviewed+APPROVED+MERGED** @ `cfd08051`. 13 sites converted; 2 raw `<button>`s gained COSS Button's 44pt `pointer-coarse` hit area; every close button now has BOTH `aria-label` and `title` (0 had a tooltip before). 1318 tests. |
| 213 | Finish 202 — the 2 sites its census missed | P2 | S | 202 | **DONE — reviewed+APPROVED+MERGED**. `GoalEditorSheet.tsx` (the app's LAST raw close button — the exact iOS tap defect 202 existed to kill) + `ConnectSection.tsx`. `grep -rln "grid size-8 place-items-center" src/` → **empty**. `ModalCloseButton` now used in 15 files. |

⚠ **Advisor census error, recorded as a rule**: plan 202's census used
**non-recursive globs** (`src/routes/*.tsx`, `src/components/*.tsx`) which never
reach `src/features/goals/` or `src/routes/settings/` — it silently missed 2
genuine close buttons, one of them the last raw one. **Any repo-wide census must
use `grep -rn … src/` (recursive), never per-directory globs.** This is the
SECOND census-methodology error of this batch (the first: reading the quarantined
`ui/button.tsx` instead of the real `coss/button.tsx`), and **both were caught by
executors measuring reality rather than trusting the plan**. 202's executor found
these, correctly refused to expand scope unilaterally, and flagged them — the
right call; extending scope is the reviewer's job.

**Deliberately NOT unified**: `src/components/ui/dialog.tsx:67` — the vendored
base-ui Dialog primitive's own internal close affordance, inside the quarantined
`ui/` layer (app code may not import it per `ui/README.md`). Not a hand-built app
close button; not ours to unify. `ModalCloseButton`'s docstring records this.

**Still deferred** (202's own follow-up): wire `ModalCloseButton` into
`ModalShell` behind a `showClose` prop so new modals get it free. Every modal
hand-rolls its own `<header>`, so hoisting the button means hoisting the header —
worth doing once those headers are uniform.

## 212 — stat-strip mobile scroll-snap (`/improve plan` @ `3a205f7c`, 2026-07-16)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 212 | Fix mobile stat-strip scroll-snap — one-line CSS fix; repairs BOTH 帳戶 and 投資 | P3 | S | — | **DONE — reviewed+APPROVED+MERGED** @ `56623b90`. `flex-direction: row` (no `!important`, cascade prediction held) at `globals.css:700`; live-measured 375px both pages flexDirection=row + horizontal overflow, 1280px still grid; dev-server cwd lsof-verified. 1318 tests. |

Discovered by 210's executor (verified by the advisor). Cascade root cause
confirmed: globals.css's `.ns-holdings-*` are **unlayered**, Tailwind's
`flex-col` is **layered** → unlayered wins, so a plain `flex-direction: row`
(no `!important`) at :700 fixes it (the `display:flex !important` on that line
needs `!important` only to beat the later-in-file `:1269 display:grid`, an
intra-file source-order fight, not the utility). Fix is media-query-scoped to
mobile; desktop grid untouched. Deferred out of scope: a pre-existing
`padding-bottom` override quirk on the same line (cosmetic).

## Session close 2026-07-16 (`main` @ `1f56a812`) — 198–211 ALL DONE

**Every plan from this session's backlog is executed, reviewed, and merged**:
198, 199, 200, 201, 203, 204, 206, 207 (spike), 208, 209, 210, 211. Plus 195's
doc merge, the lockfile PR, and the origin-divergence resolution. Final gates on
merged `main`: tsc 0 / lint **0 errors** / **1318 tests** / build 0.
205 was never written (premise falsified — see the 201–205 section). 202
(`ModalCloseButton`) remains the only unexecuted written plan.

Late-session highlights the rows below don't capture:
- **203 caught a wrong-file error that survived three reviews**: the audit's
  Button pixel tables cited the quarantined `ui/button.tsx`; the real component
  is `coss/button.tsx` (responsive svg sizes, HAS `xl`+`destructive-outline` —
  meaning DESIGN.md:256's original row was right and 200's A4 "correction" was
  inverted; now re-corrected). Rule recorded: **`coss/` is the component source
  of truth; never cite `ui/` for app behavior.** Side-finding, accepted not
  reverted: 200's `h-9`→`lg` swap made 6 toolbar buttons h-10 below 640px
  (aligns with coss's mobile sizing; 200's "zero visual change" claim was false
  on mobile).
- **211 (highest-risk plan) landed clean**: merge-on-pull for untouched system
  mints only (`revision===1` + mint fingerprint; user-edited books never
  auto-merged), seam verified OUTSIDE `withOutboxSuppressed`, kind-aware
  straggler heal (dead company book → resurrect; dead personal/unknown →
  re-home), announce-on-local-merge-only via drainable counter (repositories
  never imports Toast). +33 tests incl. outbox-propagation and idempotence;
  live-verified with a fabricated duplicate (merged, toast fired, net worth
  unchanged, second reload byte-identical).
- **204 residuals** (executor lost to a session limit during verification;
  advisor completed the review directly): (1) BookManager's 確定刪除 confirm
  stays `destructive-outline` (pattern says solid `destructive`) — caused by
  the reviewer's own "leave the worked example untouched" instruction; one-line
  follow-up. (2) Operator visual pass on the new destructive styling pending —
  structurally palette-safe (`--ns-loss` used zero times).
- **Worktree hazards, systemic** (for future dispatches): the shared preview
  server serves the MAIN checkout (burned 4 executors; `lsof`-verify cwd), and
  `preview_start` reuses it even under a distinct config name. One executor
  briefly ran git commands in the main checkout itself — restored cleanly, but
  dispatches should name the worktree path explicitly.

## Reconciled 2026-07-15 (`main` @ post-merge, v0.1.0-alpha.62)

**Merged this session** (all reviewed+APPROVED by the advisor, gates re-run personally
on merged `main`: tsc 0 / lint **0 errors** / **1278 tests** / build 0):
198, 199, 200, 201, 206, 208, 209, plus `origin/main`'s lockfile PR and the
doc-only 195 shared-books spike.

**Branch reconcile — the headline: 18 of 20 `ai-*` branches were ALREADY merged.**
The "十幾條陳年 branch" were stale local refs, not unfinished work. Safe to delete:
`chore/ai-repo-polish`, `docs/ai-changelog-alpha50`, `docs/ai-reconcile-reality-2`,
`perf/ai-cashflow-fx-index`, `perf/ai-sqlite-recompute-scope`, `refactor/ai-scrim-tokens`,
`refactor/ai-style-rule-and-label`, `refactor/ai-token-compliance`, plus this session's
merged branches.

**Only 2 were genuinely unmerged, and they are NOT equivalent:**
- `feat/ai-shared-books-spike` (`378c0e0f`) — **doc-only, 663 lines. MERGED this session.**
  Its 6 open questions were answered by the operator 2026-07-14; the doc is the record.
- `feat/ai-ga-motion-spike` (`46b00892`) — **NOT merged, deliberately.** Unlike the other
  spike it carries **code** (`router.tsx` +45, `globals.css` +26), self-labelled
  "Throwaway PoC" for plan 161 Part A (View Transitions). This index already recorded it
  as "correctly NOT merged". ⚠ **Its doc `docs/motion-ga-spike.md` (336 lines) lives only
  on that branch** — deleting the branch loses the findings. Keep the branch, or
  cherry-pick the doc alone.

**Corrected stale index claims** (they said "NOT merged — awaiting operator"):
**196 (`b64b90fe`) and 197 (`b0adf8e5`) have been in `main` since before `36d25f50`**
(the alpha.62 bump) — merged, shipped, and their artifacts verified intact at HEAD
(`TransactionsRoute.tsx`, `HoldingDetailRoute.tsx`, `investmentDailySettlement.ts`;
note they never touched `InvestmentsRoute.tsx`, so plan 201's −225-line deletion there
did not endanger them). No review was needed.

**Merge-conflict resolution, recorded** — 200 × 208 collided on the net-worth MoM badge
(`DashboardRoute.tsx`): 208 changed the `Badge variant` (fixed → market axis), 200 changed
the arrow `size={11}` → `size={14}`. Orthogonal edits; resolution took **both**. Note the
arrows sit inside a `<Badge>`, so that `size` prop is **inert** (component CSS governs) —
**plan 203 will delete it** per operator decision 3. The resolution preserves 200's intent
without pretending the prop does anything.

**Systemic hazard found — worktree verification is unreliable here.** Two independent
executors hit it: the preview/dev server's cwd resolved to the operator's **main checkout**,
not their worktree, so their first visual check silently validated the **old, unfixed code**
and returned a plausible-looking wrong answer. Both caught it only by cross-checking
resolved CSS against the main repo's file contents. Future plans that ask for live
verification in a worktree must warn about this explicitly.



Backlog index for the `improve` skill. Each `plans/NNN-*.md` holds a plan's full
spec + its own Status block; this index keeps only **live, actionable state**.

> **Slimmed 2026-07-12.** ~500 lines of dated reconcile narrative + verbose
> per-plan rows (001–155, all long since merged) were removed to keep this index
> cheap to read — it is NOT auto-loaded into context, but every `/improve` op
> re-reads it. All removed detail is preserved in each plan file and in this
> file's git history (`git log -p plans/README.md`). Nothing was lost.

## 208–210 — operator UX batch #2 (`/improve plan` @ `087a9b2e`, 2026-07-15)

Three operator-reported items with screenshots. All planned directly (no audit).

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 208 | 淨值變動 badge onto the gain/loss axis — under 紅漲綠跌 the hero badge (green, `success/error`) contradicts 投資今日 (red, gain/loss) for the *same day's* movement; §2.4 never classified 淨值變動 at all. Badge `gain`/`loss` variants already exist. Fix = variant swap + §2.4 amendment | P1 | S | coordinate w/ 209 (same file, different region) | **DONE — MERGED** @ `6612c77b`. 淨值變動改行情軸；與 200 在 badge 撞過一次，解衝突取兩邊。 |
| 209 | 總覽 banners dismissable with **state fingerprints** — dismiss = "seen this occurrence", reappear on identity change (health: sorted issue kinds; overspend: month+category names, **amount deliberately excluded** or dismissal is useless). Overrides the recorded "stays discoverable" one-liner tradeoff with the operator's explicit request; new `dismissedBanners` in uiPreferences (per-device, not synced) | P2 | M | coordinate w/ 208 | **DONE — MERGED** @ `b9cf0d5f`. +12 測試；executor 找到 advisor 計畫的缺陷（`kind` 撞號→改 `kind:id`）。 |
| 210 | 帳戶 summary adopts 投資's visual language — 3 side-bar cards → one `ns-holdings-summary` strip (`data-cols="3"` param, 1-line CSS); N per-currency progress cards → one 幣別配置 alloc bar + legend. **Zero `InvestmentsRoute` changes** (pure class reuse → no 201 conflict). Full digits kept (reconciliation identity must stay visibly checkable — deliberate divergence from 投資's compact format) | P2 | M | **after 206 lands** (same file) | **DONE — MERGED** @ `19d94ade`. 附帶發現既有 mobile scroll-snap bug → plan 212。 |

Key decisions encoded: **208 does NOT unify all colors** — full uniformity was
tried 2026-06-10 and rolled back (toasts turned red, expenses green); the fix
closes the classification gap (net-worth delta = market number), and the
remaining 投資-red vs 現金流-green split in TW mode is the decided semantics.
**209's fingerprint granularity is the whole design** — too fine (amounts) makes
dismissal useless, too coarse suppresses a NEW category's overspend alert.
**210 must wait for 206** (both edit `AccountsRoute.tsx`; 206's executor was live
at planning time).

## 206–207 — 帳本 (Books) data bugs, operator-reported live (`/improve plan` @ `087a9b2e`, 2026-07-15)

Operator hit two real bugs while using the app. **These outrank the 201–205
button/icon batch — data integrity before button looks.**

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 206 | `deleteBook` — soft-delete a 帳本, guarded on accounts / invoices / clients / last-personal-book. The escape hatch: operator has a duplicate 個人帳 they cannot remove | P0 | M | — | **DONE — MERGED** @ `2f98f054`. soft-delete + 4 道守衛 + 14 測試（含守墓碑的 outbox 回歸測試）。 |
| 207 | **SPIKE** — how should the default 帳本 converge across devices? Doc-only (+ optional pure-domain PoC) | P1 | M | — | **DONE — MERGED** @ `76b879ed`. 推薦 (c) merge-on-pull + straggler self-heal；發現 naive merge 會製造 FIRE/淨值靜默排除的數字 bug。→ build plan 211。 |
| 211 | 帳本收斂 build — merge-on-pull（只合 untouched system mints：`revision===1` + mint 指紋，**使用者建立/編輯過的帳本永不自動合併**）+ kind-aware straggler self-heal（死公司帳→復活、死個人帳/未知→搬回預設）+ 本機 merge 才告知 | P1 | M–L | 207, 206 | **DONE — MERGED** @ `971e0135`. +33 測試（含 outbox 傳播 + 冪等）；seam 驗證在 `withOutboxSuppressed` **外**（本計畫頭號陷阱：跑在裡面則墓碑永不進 outbox、跨裝置永不收斂）；live 驗證偽造重複本→合併→toast→淨值不變→二次重載 byte-identical。 |

### Confirmed root cause (duplicate 個人帳)

`initialize()` → `ensureSqliteDefaultBook()` (`repositories.ts:2487`) runs on
**every app start and BEFORE any sync pull**. It mints a book with
`createId("book")` = `` `${prefix}_${crypto.randomUUID()}` `` — a **random UUID**
(`repositories.ts:554`). Device A mints `book_<uuidA>` 「個人帳」; device B, on its
first run, has not pulled yet so it finds nothing and mints `book_<uuidB>`
「個人帳」. `books` is a synced entity (outbox trigger `repositories.ts:4885`; pull
allowlist `pull.ts:194`) → both devices show both. The `kind='personal'` guard only
blocks a second **local** insert, never a **foreign** one. **Operator's live report
— both devices show two 個人帳 — is this mechanism's fingerprint.** A third device
mints a third.

Why 207 is a spike, not a build plan: the obvious fix (deterministic id) doesn't
work alone (existing installs hold random ids → a fresh device still ends up with
two), and the migration that would make it work re-points account ownership across
devices under last-write-wins — in a finance app, with a **version-skew mode that
can turn one duplicate into three**. Advisor's prior is deterministic merge-on-pull;
the spike must verify or destroy it.

### `deleteBook` never existed — by documented deferral, not oversight

`repositories.ts:275-276`: *"No delete yet (soft-delete needs account-reassignment
UX — deferred to a later phase)."* 206 is that phase. Design follows the repo's own
precedent — `deleteAccount` (`repositories.ts:970`) **blocks** with a zh-TW throw
(`"已有交易的帳戶不能刪除。"`) rather than cascading. Blocking is not a dead end: the
account editor already has a book picker (`AccountsRoute.tsx:854`). Note `invoices`
and `clients` **also** carry `book_id` (`migrations.ts:266,290`) — not just accounts.

### ⚠ Third bug — UNRESOLVED, deliberately NOT planned

The operator's 公司帳 book row does not reach device B, while the **account's**
`bookId` does (B shows the account with a blank book → it holds `book_company` but
has no such row). **The advisor audited every link end-to-end and found no code
defect**: outbox trigger has `["books","book"]`; `collectPendingChanges` doesn't
filter record_type; `push.ts` is generic; the worker relay stores **opaque
ciphertext** and cannot filter by entity; `pull.ts`'s `VALID_ENTITIES` includes
`"book"` and `isValidPayload` is generic; `applySqliteSyncChange` maps
`book: "books"`; `normalizeSqliteSyncPayload` does generic snake→camel;
`createBook` uses the same `personalSpace`; and `createBook` + the trigger shipped
in the **same commit** (`c8830b32`) so there is no version window.
`repositories.books.test.ts` even has a regression test asserting a created book
lands in the outbox.

**No fix is planned because no defect was located** — writing one would be guessing.
Believed to be runtime state (a lost/acked envelope, or a pull cursor). Pending
operator test: **rename the 公司帳 on device A** → `updateBook` does
`revision = revision + 1` → new outbox id `book:<id>:2` → forces a re-push. Outbox
ids are `entity:id:revision` and `pushed_at` is set on ack, so **a lost push at a
given revision is never retried** — that durability gap is real and confirmed, and
is the next planning candidate if the rename test succeeds.

### ⚠ Observed data-loss mode — warn before touching book assignments

The operator watched a **stale device overwrite a correct assignment**: device B
still had account X in its own 個人帳 (never received the 公司帳), pushed, and
last-write-wins **overwrote device A's correct 公司帳 assignment**. Any work in this
area must not make that class of event more likely. Until 公司帳 reaches B, book
assignments on B must not be touched.

## 201–205 — button/icon design critique batch (`$impeccable critique` @ `36d25f50`, 2026-07-15)

Operator asked for a broader review than 200's mechanical scope: "不單是大小問題,
還有其他的一致性、位置". Ran `$impeccable critique src/routes` dual-agent (A design
review · B detector + live browser measurement). **Score: 22/40 (Acceptable)** —
snapshot at `.impeccable/critique/2026-07-15T08-28-57Z__src-routes.md`.

**Headline: the icon layer is fine; the button layer isn't.** Glyph→concept
mapping is near-airtight (`PencilSimple`=edit 38×, `Trash`=delete 37×,
`ArrowsClockwise`=refresh 33× — **zero collisions app-wide**). The operator's
actual worry was the healthy part. The disease is in buttons: six close-button
treatments, `variant="destructive"` defined-but-used-**zero** times across 227
`<Button>` call sites, `title` vs `aria-label` decided per-file.

**Operator decisions (2026-07-15), which these plans encode:**
1. **Duplicate modal first** (not ModalCloseButton) — stop the bleeding before abstracting.
2. ~~**The ghost/outline monoculture is NOT intentional** — accent reaches only 2
   buttons app-wide. Worth adding primary at high-value moments (→ 205).~~
   ⚠ **VOID — the premise was false. See the correction below.**
3. **Icon-size contradiction resolves in the COMPONENT's favour** — DESIGN.md §7's
   13–16 band is wrong about Button/Badge internals; rewrite §7 and **delete the
   inert props** (→ 203).

⚠ **Decision 3 supersedes ~1/3 of plan 200's Phase B.** 200 raised 31 icon props
to 14; **10 of them are inert** (inside Button/Badge) and decision 3 deletes them.
No revert needed — merge 200, then 203 deletes those 10. Net result identical;
the churn is the cost of my plan-200 blind spot, not executor error.

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 201 | Delete the duplicated 編輯持倉 modal in InvestmentsRoute; use shared `HoldingEditModal` — **already-drifted: B16 Yahoo price view is in the component, absent from the copy (16 vs 0 grep hits), so the same button gives different capabilities per entry point** | P0 | M | — | **DONE — MERGED** @ `e697ac93`. −218 行；B16 Yahoo 價格檢視補回投資列表入口（兩份已實際分岔）。 |
| 202 | Extract `<ModalCloseButton />`, replace **14** sites (six treatments: 3 hit sizes / 3 icon sizes / 3 hover languages; the 3 raw `<button>`s forfeit the 44pt `pointer-coarse` expansion). Advisor's own census corrected the critique: **14 sites not 13**, and the raw ones carry `X size={18}` not 16. Also: **17 `aria-label="關閉"`, ZERO `title` — no close button anywhere has a tooltip** | P0 | M | 201 (**soft** — plan says don't wait; expect 13 if 201 landed) | **DONE — see the 202/213 section at top** (this row was stale; corrected at reconcile 2026-07-17) |
| 203 | Rewrite DESIGN.md §7 (component wins) + delete the 10 inert `size` props inside Button/Badge | P1 | S | **plan 200 must be merged first** | **DONE — MERGED** @ `72d9ff40`. §7 改雙 scope + 刪 10 個無效 prop；第 3 commit 更正貫穿 200/203 的 wrong-file 錯誤（真元件是 `coss/button.tsx`）。 |
| 204 | Adopt `variant="destructive"` / `destructive-outline` (**0 uses today**, both defined); collapse the hand-rolled red inline objects; one token (`--ns-neg`); one string (「確定刪除」 7× vs 「確認刪除」 3×). Advisor's census found **5 dead hex fallbacks** — `var(--ns-danger, #d33)` / `#c0392b` never fire (`--ns-danger` IS defined at `globals.css:157`) and **all three hexes disagree with the real `#c62a1d`** | P1 | M | 201, 202 (**both soft**) | **DONE — MERGED** @ `1f56a812`. 23 個 destructive 呼叫點；記帳頁刪除鈕首次與編輯有視覺區隔；`--ns-loss` 零使用（台股配色下結構性保紅）。 |
| 205 | ~~Primary/accent at high-value moments~~ | — | — | — | **NOT WRITTEN — premise falsified, see below** |

### ⚠ Correction to the critique (advisor, 2026-07-15): "accent reaches only 2 buttons" is FALSE

While writing 205 I verified the claim and it does not hold. **Assessment A grepped
inline `var(--ns-accent)`** — which finds only `AppShell.tsx:268` (Quick Add) and
`:418` (FAB) — **and missed the real chain**:

`globals.css:63` → `--primary: var(--ns-accent)`; COSS Button's `default` variant is
`bg-primary`; **every `<Button>` omitting `variant` renders accent green. There are
62** (e.g. `AccountsRoute.tsx:304` 新增帳戶). Assessment B missed it too — it only
sampled `variant="outline"` toolbar buttons. **The advisor's synthesis verified
`destructive` = 0 but did not verify `primary` = 2. That was the gap.**

A red herring ruled out on the way: `globals.css:1812` has a *second*
`--primary: oklch(0.922 0 0)`, but it sits inside a `.dark {}` block and **nothing in
this app ever adds a `dark` class** (theme is `data-theme`, via
`uiPreferences.ts:269-275`). So `:63` is the only live definition.

**Consequence: accent is not scarce, it is *unconsidered*.** 62 buttons became primary
because nobody typed a prop. The critique's own question 3 — "primary is encoded as
the *absence* of a prop; a reviewer cannot catch a missing prop" — was more right than
it knew. The real question is whether `variant` should become **required** (~227 call
sites of blast radius), not whether to add more accent. **Operator decision 2 is void
and must be re-asked.**

### NEW finding while verifying the above: dead `.dark {}` shadcn palette (landmine)

`globals.css:1806-1838` — a complete 33-line shadcn default palette (`--background`,
`--foreground`, `--card`, `--popover`, `--primary`, `--secondary`…) inside `.dark {}`.
Dead today. **Anyone who copy-pastes a shadcn component or follows shadcn docs and adds
`className="dark"` silently hijacks the entire theme.** Not yet planned.

**Verified by the advisor personally** (not taken from subagent reports):
`variant="destructive"` = **0** call sites, `destructive-outline` = **0**, both
defined in `coss/button.tsx`; `* { cursor: default !important; }` at
`globals.css:603` makes 84 inline `cursor:"pointer"` **dead code**; the
`:focus-visible` rule at `globals.css:616-623` is **unlayered** so it outranks
~20 `outline-none` classes — focus is genuinely safe app-wide (A predicted a
finding and verified there wasn't one; B independently tabbed the chrome and
agreed).

**A/B contradiction, resolved**: B measured every icon-only button at 24–32px and
called the 44pt touch-target failure "systemic." **False positive for COSS
Buttons** — `coss/button.tsx:12` has `pointer-coarse:after:min-h-11 min-w-11`,
which only applies under `@media (pointer: coarse)`; B measured at desktop with a
fine pointer, where 24–32px is correct. The finding survives **only** for controls
bypassing COSS Button: `HoldingEditModal.tsx:175`, `InvestmentsRoute.tsx:1729`,
`AppShell.tsx:437`, sidebar collapse toggle. → folded into 202.

**Audit-only, NOT planned** (recorded so nobody re-audits): 84 dead inline
`cursor:"pointer"`; 27 redundant `fontFamily:"inherit"`; 7 `ns-*` classes
referenced but never defined (incl. `ns-btn-icon` — the ghost of the exact
abstraction 202 builds); `QuickAdd.tsx`'s 4 hand-rolled pills with 4 paddings
while `SegmentedControl`/`FilterPill` already exist; two `Button` implementations
with divergent physics (`coss` ring-2/opacity-64/solid-destructive vs `ui`
ring-3/opacity-50/soft-destructive — every date picker renders the `ui` one);
`weight="bold"` ~50/50 on-rule; `weight="duotone"` 41 uses undocumented but
coherent (docs fix); `AppShell.tsx:177` layout-transition (detector's only hit,
low impact — note `:154` double-animates the same collapse via
`grid-template-columns`); `AccountsRoute` inline banners instead of `toast`
(§12.5 violation, whole route is the exception); `AccountsRoute.tsx:485` deletes
an account with no confirm (§12.2 — blast radius limited, `repositories.ts:970`
rejects accounts with transactions).

## 198–200 — operator UI batch (`/improve plan` @ `36d25f50`, 2026-07-15)

Three operator-reported items, planned directly (no audit). All independent —
no ordering dependency; numbered by leverage. **199 and 200 both touch
`DashboardRoute.tsx:1529`** (an out-of-band `size={12}` icon): whichever lands
first makes the other's edit a no-op. Don't run them concurrently.

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 198 | 帳本 switcher popover renders behind the sidebar — `positionerClassName="z-[1101]"` on `BookSwitcher`'s `PopoverContent` (sidebar aside is z-1100 by design; portaled popover defaults to z-50) | P1 | S | — | **DONE — reviewed+APPROVED+MERGED** to `main` via `d92c7fae` (`--no-ff`, revertable). Branch `fix/ai-bookswitcher-popover-z` @ `72179b7b`. tsc 0 / lint 0 errors / 1252 tests. **Operator visually confirmed the sidebar menu now appears.** Executor correctly skipped the optional test (BookSwitcher needs `useFinanceData`+zustand mocking beyond the named exemplar's) |
| 199 | 總覽 AI 本月摘要 gets its own full-width row under the header — out of the `justify-between` left column, drop `max-w-xl`, refresh button to the row's right edge via `justify-between` + `icon-xs` | P2 | S | — | **DONE — reviewed+APPROVED+MERGED** to `main` via `087a9b2e` (`--no-ff`). Branch `fix/ai-dashboard-summary-layout` @ `6bad8e38`. tsc 0 / lint 0 / 1252; privacy guards + generation logic byte-unchanged. **Operator visually confirmed.** ⚠ One REVISE round was **the advisor's fault, not the executor's** — the dispatch prompt truncated Step 1d, then the executor was wrongly accused of skipping it. Lesson applied to 200: pass the plan's absolute path instead of hand-inlining |
| 200 | Button/icon consistency audit → `docs/button-icon-audit.md` (Phase A, gated) + mechanical fixes only (Phase B): sub-13 icons → 14, 6 hand-rolled `h-9` → `size="lg"` | P3 | M | coordinate w/ 199 | **DONE — reviewed+APPROVED, NOT merged** (operator's call). Branch `fix/ai-button-icon-consistency` @ `1f171585`, stacked on 198+199, **3 independently-takeable commits**: `1e603f19` audit doc + DESIGN.md, `42955c15` 14 src files (33+/33−), `1f171585` the CSS-override finding. tsc 0 / lint 0 / 1252 / build 0. **Executor corrected the advisor's census twice**: Button-only variants are `outline` 63 (not 84) and `secondary` 0 (not 5) — raw grep conflated `<Badge>`; and it verified the CSS override in the **compiled** CSS, not just source. ⚠ **~1/3 of Phase B is superseded by operator decision 3** → plan 203 deletes the 10 inert props. **MERGED since** (`1f171585` verified ancestor of main at reconcile 2026-07-17; the "NOT merged" here was stale — the 2026-07-16 session-close merged it) |

**198 is a real functional bug, not polish**: the 帳本 feature's primary entry
point (188–194, shipped alpha.61) is unreachable — the dropdown paints behind
the sidebar. One prop.

**Census behind 200** (at `36d25f50`, reproducible — commands in the plan):
icons appear at 8 distinct sizes vs `DESIGN.md` §7's two sanctioned bands
(13–16 general, 18–26 list/card); 29 instances fall below the band (12×18,
11×12, 10×3). `DESIGN.md`:256 is also **stale** — it documents a Button `xl`
size and `destructive-outline` variant that `ui/button.tsx` never implemented.
200 Phase A fixes the doc; Phase B fixes only what `DESIGN.md` already decided.

**Deliberately NOT in 200** (audit-only, needs operator taste — see the plan's
open questions): the ~22 raw `<button>` in `CashFlowRoute.tsx` + others
(bespoke-by-design vs drifted needs design judgment); the ghost(93)/outline(84)
affordance split; whether §7 should narrow from a 13–16 band to a single
default of 14 (if yes, an ESLint rule on the Phosphor `size` prop is the real
fix — a sweep deletes drift, a lint rule prevents it); the 13 `size={18}`
icons; in-band 13/15 normalization.

## Reconciled 2026-07-14 (`main` @ `db007657`, v0.1.0-alpha.61)

- **帳本 Phase 1+2 (188–194) ALL MERGED and SHIPPED in alpha.61.** Verified by
  artifact at `db007657`: `bookScope.ts`, `salesTax.ts`, `invoiceNumbering.ts`,
  `invoiceReporting.ts`, `invoiceEntry.ts` present; snapshot-roundtrip fix
  `f20ea5dc` in history; merge commits `da6c993c` (193), `51cf90ed` (191),
  `844b7c17` (194) on main. **Corrected four index rows** (189/190/192/193)
  that still read "NOT merged — awaiting operator" — they are merged.
- **196–197 (投資對帳) executed this session** (`/improve execute`, 2026-07-14):
  both reviewed+APPROVED on stacked branches `fix/ai-investment-total-fee`
  (`b64b90fe`) → `feat/ai-daily-settlement` (`b0adf8e5`), off `db007657`. tsc 0
  / lint 0 / 1252 tests. NOT merged — awaiting operator's merge decision.
- **142 (DCA spike) drift-checked — still valid TODO.** `DashboardRoute.tsx:100`
  still hides 定期定額 reminders "until the DCA workflow is finalised";
  `RecurringInvestmentsTab.tsx` still present-but-gated. Finding intact.
- **143 SUPERSEDED by 195** (terminal). **195 (共享帳本 spike): all 6 open
  questions answered by operator 2026-07-14** — Phase 3/4 build plans can be cut
  from `docs/shared-books-plan.md` whenever the operator starts Phase 3.
- **Executable right now**: merge decision on 196/197 (operator's call). No
  advisor-side plan is blocked. Next planning frontier is 帳本 Phase 3 (from 195).
- **macOS window-drag fix — DONE (operator-confirmed 2026-07-14).** Not a tracked
  `plans/` item, recorded here for completeness. The fix is live in `main` via
  `4a78b09c` (transparent title bar + drag region) + `b5f3172d`
  (`core:window:allow-start-dragging` grant) + `52c75771` (sidebar header
  draggable); verified at `db007657`: `data-tauri-drag-region` / `ns-titlebar-drag`
  in `AppShell.tsx` and `titleBarStyle: "Overlay"` in `tauri.conf.json`. The stale
  local branch `fix/ai-macos-window-drag` (`734c80e8`) was a superseded earlier
  take (not an ancestor of `main`) — safe to delete.

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
| 189 | 帳本 Phase 1b UI — 側欄切換器(Search 與 QuickAdd 之間)、`bookScope.ts` 語意先寫成測試(總帳 identity / 過濾 / FIRE toggles / 跨帳本轉帳中性)、§1 12 surfaces 逐 cluster 範圍化、帳戶歸屬+帳本管理、QuickAdd/EntryDrawer 預設帳本 | P2 | L | 188 MERGED | DONE — reviewed+APPROVED (1 STOP for operator hero-KPI decision), branch `feat/ai-books-switcher` @ `59866d9c` (9 commits, off `fd724031`). MERGED to main (帳本 Phase 1, shipped alpha.61). `bookScope.ts` (4 helpers, 7 tests) + sidebar 帳本 switcher + 12 §1 surfaces scoped per two-axis rule (general=switcher, FIRE-family=fireMetricAccountIdSet switcher-independent) + AccountsRoute 帳本 select + 帳本管理 modal + QuickAdd/EntryDrawer book-default. **Hero-KPI: operator decided netWorth follows switcher; firstGoalPct/FIRE recomputed from personalNetWorthAccountIdSet so they DON`T move with switcher.** Zero repo/sync/migration change. tsc 0 / lint 0 / 1178 tests; 188 booksPartition byte-unchanged+green. **Reviewer LIVE browser pass (worktree vite): switcher renders between Search/QuickAdd + lists 總帳/個人帳/公司帳; 帳本管理 modal creates books; 個人帳 toggles ON / 公司帳 toggles OFF (188 semantic verified in UI); 0 console errors.** Executor judgment calls (all sound): milestone toast bound to personalNetWorth; cross-book transfer/代墊 pickers full-list; asset book-membership by owning-or-linked account. |

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

- **`.claude/worktrees/` pollutes Tailwind builds** (reconcile 2026-07-17, proven by
  plan 217's executor): Tailwind v4 auto-source scanning respects `.gitignore`, and
  `.claude/worktrees/` isn't in it — stale worktree file copies emit dead utility
  classes into compiled CSS. One-line fix: gitignore `.claude/worktrees/`; also
  `git worktree remove .claude/worktrees/busy-mestorf-dd21b7` (verified clean + fully
  merged, zero unique work). Operator/next-session task — too small for a plan.
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
| 190 | Phase 2a foundation — `Invoice`+`Client` entities, `salesTax.ts` (round(含稅×5/105)) + `invoiceNumbering.ts` (TW 統一發票 preset) pure modules, full sync wiring (mirror 188's book playbook), `stampInvoiceSettled`, dual-harness + characterization. Zero UI, no LedgerTransaction change. | P2 | L | 188+189 (merged) | DONE — reviewed+APPROVED, branch `feat/ai-invoices-foundation` @ `a35e4ff3` (5 commits, off `41d44e04`). MERGED to main (帳本 Phase 2a, shipped alpha.61; entities/`salesTax.ts`/`invoiceNumbering.ts` present at `db007657`). `Invoice`+`Client` entities; `salesTax.ts` (round(105000×5/105)=5000 ✓) + `invoiceNumbering.ts` (TW 字軌 `^[A-Z]{2}\\d{8}$` + 8-digit increment + overflow guard) pure modules; sync wiring EXACT parity w/ book (invoices=8/clients=8/books=8 grep); `stampInvoiceSettled`/`findInvoiceByLedgerId`; +36 tests (1214 total); characterization byte-frozen; **LedgerTransaction unchanged (verified)**. Reviewer-confirmed design: tax fields on `invoices` table ONLY. ⚠ SURFACED: snapshot round-trip gap → plan 192 (188 SQLite-export-drops-books regression + invoices/clients not in backup). |
| 192 | Snapshot round-trip fix (P1 data-integrity) — SQLite `exportSnapshot` omits `books` (188 shipped regression: desktop backup/restore silently drops books) + add invoices/clients to `RepositorySnapshot` + all 4 export/import paths; round-trip test first | P1 | S | 190 MERGED | DONE — reviewed+APPROVED, branch `fix/ai-snapshot-roundtrip` @ `f20ea5dc` (off `e1e3c3b0`). MERGED to main (fix `f20ea5dc` in history at `db007657`; shipped alpha.61). Round-trip test FAILED pre-fix (SQLite lost company book, browser lost client — both gaps proven), passes post-fix; asserts book id/kind/toggles/color + client 統編 + invoice 號碼/稅額. Fix: SQLite exportSnapshot += books (188 regression) + invoices/clients through all 4 export/import paths + `RepositorySnapshot` type; `?? []` guards (normalizeStoredData 5346-5354) keep pre-190 snapshots importable. Only repositories.ts + new test touched; no entity shape/UI change. tsc 0 / lint 0 / 1216 tests. |
| 191 | Phase 2b-1 UI — 開發票流程 (extends `ar`, auto tax via computeSalesTax, TW 字軌 preset), 客戶主檔 + ClientAutocomplete, wire `stampInvoiceSettled` into `confirmSettle`, `invoiceEntry.ts` pure helper. Company-book-gated. | P2 | L | 190+192 (merged) | DONE — reviewed+APPROVED + LIVE-VERIFIED (integrated w/ 194), branch `feat/ai-invoice-entry` @ `14d82459` (off `50419301`). 開發票 toggle on `ar` (company-book-gated), `invoiceEntry.ts` pure helper (105000→未稅100000/稅5000 ✓), ClientAutocomplete+ClientManager, create-ledger-then-invoice w/ orphan-safe ordering + `InvoiceMetadataError` toast, `stampInvoiceSettled` in confirmSettle (verified no-op for plain 應收). tsc 0 / lint 0 / 1227 tests. Combined steps 2-5 into 1 commit (documented, sound). Live-verified (ar drawer + company-gate). MERGED to main @ `51cf90ed`. |
| 194 | Fix 189 regression — `bookScope.scopeRows` drops unsettled 應收/應付 (`accountId:""`) from 未結清 in EVERY book view incl. 總帳 (found by 191 executor). One-line filter widen + test. | P1 | S | — | DONE — reviewed+APPROVED, branch `fix/ai-bookscope-unsettled` @ `d2a20c41`. One-line `scopeRows` widen (`!row.accountId || …`) + test (fails pre-fix `l_ar_unassigned` missing, passes post). tsc 0 / lint 0. LIVE-VERIFIED (未結清 shows the accountId="" row). MERGED to main @ `51cf90ed`. |
| 193 | Phase 2b-2 reporting — `invoiceReporting.ts` pure math (agingBuckets/DSO/outstandingSalesTax/bimonthly401Summary) + 3 company-book-gated CashFlow cards (帳齡+DSO, 本期應繳營業稅, 401 雙月彙總). Completes Phase 2. | P2 | M | 190+191+194 (merged) | DONE — reviewed+APPROVED (1 revision: aging buckets) + LIVE-VERIFIED, branch `feat/ai-invoice-reporting` @ `f4b7aac8`. `invoiceReporting.ts` (agingBuckets 5 real buckets 未到期/1-30/31-60/61-90/90+, DSO, outstandingSalesTax, bimonthly401Summary) +17 tests; 3 company-gated cards. **REVISE fixed finance-correctness bug: a 15-day-overdue invoice was labeled 未逾期 — now correct 逾期1-30.** MERGED to main @ `da6c993c`. tsc 0 / lint 0 / 1245 tests. **LIVE (reviewer): company book → 開發票 (105000 含稅 → 未稅100000/稅5000, TW字軌 AB12345678) → 帳齡「未到期 1筆 105,000」+ 應繳營業稅卡 + 401表 all render; 開發票/客戶 buttons company-gated.** MERGED to main @ `da6c993c`. Completes 帳本 Phase 2 (188–194 all merged, shipped alpha.61). |

## 196–197 — 投資對帳 (operator ask, `/improve plan` 2026-07-14 @ `db007657`)

Two operator requests on the 投資 交易紀錄 surface: (1) a 總額 bug — the on-screen
total drops the 手續費 (台光電 2×5065 shows −10,130, should be −10,138); (2) a 日結
view for reconciling against the broker's daily 成交回報 email. Diagnosis: the
**ledger cash leg is already correct** (`calculateInvestmentCashDelta` includes
fee); only the two display sites compute gross. 196 rewires the display to the
ledger's own cash-delta fn; 197 adds a 日結 grouping toggle with per-day 小計.
Operator decisions for 197: grouping-mode toggle (not a new route); 小計 columns
成交金額/手續費/應收付, combined fee (no 交易稅 split).

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 196 | 投資 總額 shows real net cash (incl. fee/tax) — rewire `TransactionsRoute` + `HoldingDetailRoute` display to reuse `calculateInvestmentCashDelta` (the ledger's own fn); opening lots stay 「—」. Display-only; balances already correct. | P1 | S | — | DONE — reviewed+APPROVED, branch `fix/ai-investment-total-fee` @ `b64b90fe` (off `db007657`). Both display sites rewired to `calculateInvestmentCashDelta`; opening lots stay 「—」. +1 test (5065×2+8 → −10138). tsc 0 / lint 0 / 1246 tests. **MERGED** (verified ancestor 2026-07-17; row previously stale — see Reconciled 2026-07-15). |
| 197 | 日結 grouping mode in 交易紀錄 — `SegmentedControl` 月分組↔日結, pure `investmentDailySettlement.ts` (group-by-day + per-currency 成交金額/手續費/應收付 小計), `InvestmentDayGroup` reusing existing row components. | P2 | M | 196 | DONE — reviewed+APPROVED, branch `feat/ai-daily-settlement` @ `b0adf8e5` (stacked on 196's `b64b90fe`). `groupByDayWithSubtotals` pure helper +6 tests (incl. 5065×2 fee8 → net −10138); month path refactored to shared `groupRowsByMonth` page-slice (untouched behavior); `InvestmentDayGroup` reuses existing row/mobile components, tfoot 小計 balanced to 9 cols; per-currency subtotals, opening lots excluded. tsc 0 / lint 0 errors / 1252 tests. **MERGED** (verified ancestor 2026-07-17; row previously stale). Live browser check skipped (data-dependent; math carried by tests). |

**Dependency**: 197 requires 196 — its 應收付 小計 sums each row's `signed`, which
only includes fee after 196 lands.

## 195 — 共享帳本 spike (Phase 3 gate, operator chose "spike now" 2026-07-13)

帳本 Phase 2 COMPLETE (188–194 all merged @ `da6c993c`). Phase 3 (shared
books / 雙向共寫) is a HIGH-risk crypto+worker surface; operator chose to run
the design spike now and decide the build later. **143 SUPERSEDED by 195**
(143 predates books + references the pre-books account-sharing model + the
then-unbuilt 130–132 crypto foundation, which has since SHIPPED).

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 143 | Household sharing spike (pre-books, account-level) | P3 | M | — | SUPERSEDED by 195 (books-aware rewrite; 143 designed against account-`isSharedToHousehold` + unbuilt 130–132; obsolete) |
| 195 | 共享帳本 key/membership spike — book-key wrapping (builds on SHIPPED pairing/secretStore/vault + worker ECDH), membership/revocation, worker namespace delta, 雙向共寫 conflict UX, phased Phase 3/4 outline → `docs/shared-books-plan.md`. Doc-only. | P3 | M | 186 §4 (merged) | DONE — reviewed+APPROVED (doc-only), branch `feat/ai-shared-books-spike` @ `378c0e0f` (`docs/shared-books-plan.md` 663 lines, 7 sections; re-verified vs SHIPPED pairing/secretStore/vault + worker 0001-0007). **Recommends: Book Space Key** (per-book AES-GCM-256 wrapped to member devices via existing ECDH, zero new crypto primitives) + **mandatory rotation on member removal**; removed member keeps pre-removal data (locked honest answer); worker `0008` +3 additive tables, per-book relay_sequence. Found dead household/devices stubs (README-only). Phase 3 read-only=M, Phase 4 雙向共寫=XL. **6 open questions gate any Phase 3 build. Operator answers (2026-07-14):** Q1 removed-member-keeps-past-data = ACCEPT; Q2 convert-in-place confirmed NOT a server-resource concern (relay stores opaque blobs, one-time small upload; cost is client-side re-encrypt only); **Q3 NEW DECISION: member display names/nicknames are LOCAL-ONLY, never uploaded — relay stores only opaque device/member ids.** Q3 recovery-kit = NONE (use re-invite); Q4 push-gate = trust client for v1 (no relay enforcement until Phase 4); Q6 private-notes = NO per-row privacy tier (whole row shared). **ALL 6 open questions now answered — Phase 3/4 build plans can be cut from the spike whenever the operator starts Phase 3.** **MERGED** (`378c0e0f` verified ancestor 2026-07-17; `docs/shared-books-plan.md` present at HEAD — row previously stale). |
