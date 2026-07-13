# Index-Nudge design spike (roadmap 6.6)

> **Status:** Decision spike — awaiting operator decision (variant A / B / C).
> **Deliverables:** this doc + `src/domain/indexNudge.ts` (+ test). No UI wired.
> **Plan:** 172. **Roadmap item:** 6.6 加入大盤引導（Index Nudge）.
>
> *(The plan cites `docs/motion-ga-spike.md` as a format model; that file does not
> exist in this branch, so this doc follows the standard spike shape: Q1 → Decision
> A → Decision B → Recommendation → Open questions → Build sketch.)*

The founding intent says「長期贏不了大盤就加入大盤」. Today the product only **shows**
Portfolio-vs-Benchmark data (an Alpha number + a cumulative-return curve); it never
turns that into the **decision** the intent describes. This spike decides *how* — and,
first, *whether we can honestly say it at all*.

---

## Q1 — Is any portfolio return series transaction-aware, or is everything fixed-basket?

**Answer: BOTH exist. A transaction-aware, cash-flow-neutral series is available
(`buildPortfolioTwr`), but the two surfaces that currently make a vs-benchmark claim
are wired to the FIXED-BASKET approximation instead.** This is the crux of the spike.

### Evidence

| Series | Transaction-aware? | Evidence |
|---|---|---|
| `buildPortfolioTwr` (期間 TWR) | **Yes** — true time-weighted, uses *historical* share counts + contributions (buy/sell/capital-reduction) + income (dividends), chaining daily factors that net cash flows out | `src/domain/portfolioAnalytics.ts:828-846` (doc: "using their **historical** share counts (not the fixed basket)… TWR removes the effect of when capital was added or withdrawn"); implementation `src/domain/portfolioAnalytics.ts:964-981` (the `(v − prevV − contrib + income) / prevV` chain) |
| `buildPortfolioValueSeries` (`core.series`) | **No** — fixed-basket: values *today's* share counts at each date's historical close | `src/domain/portfolioAnalytics.ts:12-24` (module contract: "Every series-derived metric here is built on a **fixed-basket** valuation… today's share counts") |
| XIRR (年化 XIRR) | **Yes** — money-weighted, over actual cashflows | `src/routes/InvestmentsAnalyticsTab.tsx:334-354` (`buildPositionMetrics` cashflows → `calculateXirr`) |

### The gap that matters for the nudge

The **existing vs-benchmark claims are fixed-basket**, not TWR:

- Analytics-tab Alpha card「超額報酬 / 期間累積落後 0050 X%」— `perf.alpha` is built from
  `core.series` (fixed-basket), NOT `twrResult`: `src/routes/InvestmentsAnalyticsTab.tsx:363-375`
  (`const series = core.series; … alpha = portFinal − benchFinal`). The honesty
  disclaimer on this exact number says so: `src/routes/InvestmentsAnalyticsTab.tsx:611`
  (「…屬固定權重近似。若你在期間內買賣過該標的，實際時間加權報酬可能與此不同。」).
- Dashboard north-star metric `benchmarkGap`「vs 0050 累積差距」— `stripData.alpha` is
  likewise fixed-basket (`buildPortfolioValueSeries`): `src/routes/DashboardRoute.tsx:574-598`,
  registered at `src/routes/DashboardRoute.tsx:602-611`.

Meanwhile `buildPortfolioTwr` is computed (`src/routes/InvestmentsAnalyticsTab.tsx:330-332`)
but only displayed as a standalone number (`:691-695`); **it is never compared to the
benchmark.** There is no benchmark-TWR series in the codebase today.

### What the nudge may honestly claim

A nudge that says「你長期落後大盤 X%」must not be powered by the fixed-basket Alpha, because
that number *by the app's own disclosure* can differ from real time-weighted performance
once the user has traded. The honest path is:

- **Use `buildPortfolioTwr.series`** (cumulative TWR % per date, transaction-aware) on the
  portfolio side, vs **`buildBenchmarkSeries` → `toCumulativeReturnSeries`** on the benchmark
  side. A single-instrument benchmark's price path *is* its own time-weighted return, so this
  is apples-to-apples and carries **no** 固定權重近似 disclaimer.
- The prototype in `src/domain/indexNudge.ts` therefore consumes **window returns**, and its
  header contract requires the portfolio side be TWR-derived, not fixed-basket.

**Cost of the honest path:** modest. `buildPortfolioTwr` already exists and is already run in
the analytics tab. What's missing is (a) slicing it into rolling windows and (b) a matching
rolling-window benchmark cumulative return — both pure transforms over series the engine
already produces, no changes to `portfolioAnalytics.ts` exports required.

**Documented caveats of `buildPortfolioTwr` (carry into any build):**
- v1 scope is the **currently-held basket's** transaction history; **fully-exited positions
  are out of scope** (`src/domain/portfolioAnalytics.ts:842-845`). So the nudge measures "the
  holdings you still own vs the market," not lifetime realised performance.
- Held tickers with no price history are excluded and disclosed (`:899, :944-947`).
- Gated on `MIN_ANALYTICS_DAYS` (30 obs) like every annualizable metric (`:51-56, :984`).

**Alternative if TWR were unavailable (it is not — recorded for completeness):**
(a) XIRR vs a benchmark-XIRR counterfactual (feed the user's *same* cashflow dates/amounts into
the benchmark) — money-weighted and honest, but requires building the counterfactual (re-pricing
each cashflow into benchmark units) — **medium cost**, not needed here. (b) Carry the same
固定權重近似 disclaimer — cheap but self-defeating: a hedged "you *might* be behind" undercuts a
nudge whose whole job is to make a confident call.

---

## Decision A — which product surface (variant)

| Variant | What it is | Cost | Honesty ceiling (from Q1) | Annoyance risk |
|---|---|---|---|---|
| **A — 主動判斷版** | A dismissible banner/callout in the 分析 tab that appears only when `evaluateIndexNudge` triggers, phrased as a decision (「你已連續 N 季落後大盤，累積 X%；考慮把新資金投入 0050」), with attribution pointing at the lag source, plus a "don't show again" preference. | **M** | High **iff** wired to TWR-vs-benchmark rolling windows (not the current fixed-basket Alpha). New rolling-window plumbing + banner UI + dismiss pref. | **Highest** — it's proactive and opinionated. Needs the persistence + gap floor gate (Decision B) and a dismiss to stay welcome. |
| **B — 輕量視覺版** | Rephrase the **existing** vs-benchmark card's cumulative gap in plain language (「本期間 vs 0050：落後 X%」), no proactive prompt, no new decision surface. | **S** | Capped by whatever series the existing card uses — **fixed-basket today** (`:363-375`), so it inherits the 固定權重近似 disclaimer unless also repointed to TWR. Neutral tone means the weaker claim is defensible. | **Lowest** — user opted into the analytics tab; nothing pops at them. |
| **C — 北極星指標選項** | Expose「我 vs 0050 累積差距」as a selectable north-star hero metric. | **S→already partly built** | Same fixed-basket ceiling as B today — `benchmarkGap` already ships wired to `stripData.alpha` (fixed-basket, `DashboardRoute.tsx:574-611`). Honest upgrade = repoint to TWR. | **Low** — user chooses it; but a single signed number with no persistence/attribution is easy to misread window-to-window. |

**Note on C:** the roadmap treated variant C as new/"nearly free"; in fact `benchmarkGap` **already
exists** in the north-star metric list (`src/routes/DashboardRoute.tsx:602-611`). So C is not a
build, it's a *rewire* (fixed-basket → TWR) + optional polish. That lowers C's cost but also means
C alone does **not** deliver「把資料推成決定」— it still just shows a number.

---

## Decision B — detection semantics (the prototype's parameters)

Implemented in `src/domain/indexNudge.ts` (`evaluateIndexNudge`), tested in `indexNudge.test.ts`.

Triggered ⟺ **both**:
1. portfolio lags the benchmark in **≥ `minWindows` consecutive** most-recent windows, **and**
2. the **cumulative gap over that streak ≥ `gapFloorPct`**.

Verdict reasons: `insufficient-data` · `leading` · `lagging-not-persistent` · `persistent-lag`
(only the last is `triggered`). Both thresholds inclusive; "lag" is strict (`port < bench`), so a
tie ends the streak. Honors the roadmap gate「領先或樣本不足時不出現」.

**Starting parameters (all tunable):**

- **`minWindows = 8` rolling quarters (≈ 2 years).** *Justification:* two full years of quarterly
  underperformance is long enough to distinguish a persistent structural lag from an unlucky run
  — a horizon a passive-vs-active argument is normally made over. Shorter (e.g. 4) would fire on
  noise; much longer delays a call the user would have wanted sooner. Quarters (not days) keep it
  legible and stop day-to-day wobble from resetting the streak.
- **`gapFloorPct = 5` pp cumulative** (`DEFAULT_GAP_FLOOR_PCT`). *Justification:* an 8-quarter
  streak that only adds up to a couple of points is within tracking noise and fees; requiring a
  5pp cumulative shortfall means the lag is materially costing the user before we say so. Low
  enough to catch a real chronic drag, high enough that a hair's-width lag never triggers.

**Window construction (for the build, no OHLC needed):** rolling quarters built from daily
`close`s — each window's portfolio return from `buildPortfolioTwr.series` (cumulative TWR at
window end ÷ start), each benchmark window from `buildBenchmarkSeries`→cumulative return over the
same dates. Both derive from daily closes only, satisfying the no-OHLC constraint.

---

## Recommendation

**Variant A (主動判斷版), wired to TWR-vs-benchmark rolling windows via `evaluateIndexNudge`** —
it is the only variant that actually delivers the roadmap's stated problem (「把資料推成這個決定」);
B and C only re-show data, and the honest, disclaimer-free claim is available (Q1), so there is no
correctness reason to settle for the passive variants.

---

## Open questions for the operator

1. **Copy tone** — how opinionated? 「考慮加入大盤」(suggestive) vs 「你長期輸給大盤，該考慮指數化了」
   (blunt). Affects whether A feels like help or nagging.
2. **Dismiss-preference home** — `uiPreferences` is the precedent (`longViewMode`,
   `northstarMetric` at `src/state/uiPreferences.ts:56, :149`); a `indexNudgeDismissedAt` /
   `indexNudgeMuted` field there is the natural fit. Per-space or global?
3. **Parameters** — accept `minWindows = 8`, `gapFloorPct = 5`? Or expose as advanced settings?
4. **Benchmark choice** — always the user's selected benchmark (default `0050.TW`), or pin the
   nudge to a market-cap index regardless of the card's picker?
5. **Should B/C also be repointed to TWR** even if A is chosen, so no vs-benchmark surface in the
   app disagrees with the nudge? (Currently the Alpha card and `benchmarkGap` are fixed-basket.)

---

## Build-plan sketch (for the chosen variant)

**If A (recommended):**
- `src/domain/indexNudge.ts` — already has `evaluateIndexNudge`. Add a thin builder
  `buildIndexNudgeWindows({ twrSeries, benchmarkSeries, quarters })` (pure) that slices both into
  rolling-quarter returns and calls `evaluateIndexNudge`. Keep it in `src/domain/`, tested.
- `src/routes/InvestmentsAnalyticsTab.tsx` — consume the builder (it already computes
  `twrResult` and `buildBenchmarkSeries`), render a dismissible callout above/within the
  vs-benchmark card when `triggered`; attribution can reuse `buildReturnAttribution`.
- `src/state/uiPreferences.ts` — add the dismiss/mute field (mirror `longViewMode` plumbing:
  type at `:56`, default at `:149`, parse at `:210`, persist at `:286`, setter at `:393`).
- Copy via `copy.csv` round-trip (do not hand-edit strings in `.tsx`).
- Tests: window-builder unit test; verify no `固定權重近似` disclaimer attaches to the nudge.

**If C:** rewire `stripData.alpha` (`DashboardRoute.tsx:574-598`) and/or the analytics Alpha card
from `buildPortfolioValueSeries` to `buildPortfolioTwr` for the benchmark comparison, and register
any new metric in the same `allMetrics` list (`DashboardRoute.tsx:602-611`). No `indexNudge.ts`
needed — C is a display change, not a detection feature.

**Do not build until the operator picks A/B/C** — nothing else should depend on `indexNudge.ts`
until that decision lands.
