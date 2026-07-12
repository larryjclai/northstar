# Implementation Plans

Backlog index for the `improve` skill. Each `plans/NNN-*.md` holds a plan's full
spec + its own Status block; this index keeps only **live, actionable state**.

> **Slimmed 2026-07-12.** ~500 lines of dated reconcile narrative + verbose
> per-plan rows (001–155, all long since merged) were removed to keep this index
> cheap to read — it is NOT auto-loaded into context, but every `/improve` op
> re-reads it. All removed detail is preserved in each plan file and in this
> file's git history (`git log -p plans/README.md`). Nothing was lost.

## Current state — 2026-07-12 (`main` @ `37ccb332`, v0.1.0-alpha.55)

- **001–155: all DONE and merged to `main`.** Per-plan detail is in each
  `NNN-*.md` and git history. Grouped record below. Only two in that range were
  never built (still TODO): **142** DCA decision spike, **143** household-sharing
  design spike — both P3, client-only, dispatch when wanted.
- **156–163: motion / native-feel batch** — executed, reviewed, **ALL APPROVED**,
  but **UNMERGED** (a stacked branch chain). Your merge decision — see next section.

## 156–163 — unmerged motion batch (your merge decision)

Executed + reviewed this session via `/improve execute`. Delivered as a **linear
stacked chain** (each branch contains all prior). All gates green at every tip;
test count 1020 → 1033.

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

### 164–167 merge state (your decision) — reconciled 2026-07-12

All four executed via `/improve execute`, reviewed, **APPROVED**, operator tweaks
applied and re-verified. **Unmerged**, each on its own branch off `main` @
`9441c152`. Unlike the 156–163 stacked chain, these are **independent** branches
touching disjoint files (only 165 touches `globals.css`; no overlap) — merge in
**any order**, no rebasing needed. Every branch tip: `tsc --noEmit` 0, `npm test`
green (1033; 166 adds 7 → 1040), `npm run lint` 0 errors. No financial math
changed on any branch (analytics/domain untouched; day-change reuses
`dayChangeMovers`). Merging is yours — the advisor does not merge/push.

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
- **RecurringRulesTab category is free-text** (~`RecurringRulesTab.tsx:460`) while
  every other entry surface uses a structured picker — small plan when recurring
  rules get attention; also bypasses category-kind tagging.
- **Analytics usefulness review** — product-direction critique of AnalyticsTab /
  dashboard charts; needs `/improve next` or a live `/impeccable` session, not a
  specifiable fix.
- **Vite dev-proxy 502** — `/api/market-data` middleware 502s (Connect leaves
  `request.url = "/?url=…"`; `replace(/^\?/,"")` misses `"/?"` → `new URL("")`
  throws). Browser dev shell only; the Tauri app's Rust `fetch_market_data` is
  unaffected. One-line fix in `vite.config.ts`. Flagged as a background chip 2026-07-11.

## Deferred by design (decide-then-build)

- **085 / 086 / 087** — SwiftUI Widget + App Intents; design pinned in 085, awaiting
  your simulator-vs-$99 decision + the Tauri-regeneration spike.
- **088 Phase 7.2** — on-device AI features; Feature B (monthly summary) shipped as
  089, Feature A (transaction auto-categorization) still TODO. Product-gated.
- **077 small gaps** — Phase 3.2 iOS lifecycle sync listeners
  (`visibilitychange`/`tauri://resumed`, touches AppShell, GUI-verify); Phase 7.4
  Writing-Tools check (trivial verify). Both small.

## Manual / operator-only verification outstanding (code already shipped)

- 2-device **pairing + revocation** (131/132) — worker deployed + 25 tests; needs 2 real phones.
- **macOS GUI eyeball** — title bar / app menu / Dock badge / window restore (079).
- **Live per-route 390px QA pass** — the static RWD audit missed the nav + date-strip
  bugs found live (084); other routes may have similar live-only issues.
- **Tauri spot-check of 151/152** ticker search (the dev-proxy 502 above blocks the
  browser dev shell; the Tauri path works).

## Findings considered and rejected (do NOT re-flag)

*(This ledger is the anti-re-audit record — kept verbatim.)*

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
