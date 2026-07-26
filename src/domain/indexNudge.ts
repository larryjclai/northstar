/**
 * Index-Nudge detection prototype (roadmap 6.6 spike — plan 172).
 *
 * ── What this is ──────────────────────────────────────────────────────────────
 * A PURE detection rule for the「長期贏不了大盤就加入大盤」nudge. Given a
 * portfolio's rolling-window returns and the benchmark's returns over the SAME
 * windows, it decides whether the portfolio has lagged the benchmark *persistently
 * enough* that surfacing an "index" decision to the user is warranted.
 *
 * Consumed by the 分析 tab's nudge banner (plan 179, variant A): the tab feeds
 * {@link buildIndexNudgeWindows} the TWR-vs-benchmark cumulative series it
 * already computes, then gates the banner on {@link evaluateIndexNudge}. The
 * detection rule itself does not fetch, compute, or transform any price/return
 * series — the caller supplies already-computed window returns, so this stays
 * trivially testable and never couples to the analytics engine's internals.
 *
 * ── Honesty contract (see docs/index-nudge-spike.md §Q1) ──────────────────────
 * The window returns fed in MUST be an apples-to-apples, cash-flow-neutral
 * comparison — i.e. the portfolio side should come from a transaction-aware
 * time-weighted series (buildPortfolioTwr in portfolioAnalytics.ts), NOT the
 * fixed-basket approximation that powers the existing vs-benchmark Alpha card.
 * Feeding fixed-basket returns here would make the nudge claim "you underperformed"
 * on an approximation that ignores the user's actual buy/sell timing — the one
 * thing this feature must get right. This module can't enforce that; the doc does.
 *
 * ── Detection semantics (Decision B) ──────────────────────────────────────────
 * Triggered when BOTH hold:
 *   1) the portfolio lags the benchmark in ≥ `minWindows` CONSECUTIVE most-recent
 *      windows (persistence — one bad quarter never triggers), AND
 *   2) the cumulative gap over that lagging streak ≥ `gapFloorPct` (magnitude —
 *      noise-level lag never triggers).
 * Both thresholds are INCLUSIVE (≥). The roadmap gate「領先或樣本不足時不出現」is
 * honoured: leading or too-few-windows never triggers.
 */

export interface IndexNudgeInput {
  /**
   * Rolling-window portfolio returns (%), OLDEST first, one value per window.
   * Each entry is that window's total return, e.g. one rolling quarter's TWR.
   * Must be transaction-aware to be honest — see the honesty contract above.
   */
  portfolioReturns: number[];
  /** Benchmark returns (%) over the SAME windows, same order/length. */
  benchmarkReturns: number[];
  /**
   * Sample-size gate AND persistence threshold: need at least this many windows
   * of data to evaluate at all, and the trigger requires a lagging streak of at
   * least this length. Starting value 8 (rolling quarters over ≥ 2 years) — see
   * Decision B in the spike doc. Tunable.
   */
  minWindows: number;
  /**
   * Minimum cumulative gap (percentage points, portfolio behind benchmark) over
   * the trailing lagging streak before triggering. Floors out noise-level lag.
   * Starting value 5. Tunable. Defaults to {@link DEFAULT_GAP_FLOOR_PCT}.
   */
  gapFloorPct?: number;
}

export type IndexNudgeReason =
  "insufficient-data" | "leading" | "lagging-not-persistent" | "persistent-lag";

export interface IndexNudgeVerdict {
  /** True only for reason "persistent-lag". The single output a UI would gate on. */
  triggered: boolean;
  /** Length of the trailing run of windows where portfolio < benchmark (strict). */
  consecutiveLagging: number;
  /**
   * Cumulative gap (pp, positive = portfolio behind) summed over the trailing
   * lagging streak. `null` when there is no lagging streak (leading) or data is
   * insufficient — i.e. whenever `consecutiveLagging === 0` or reason is
   * "insufficient-data".
   */
  cumulativeGapPct: number | null;
  reason: IndexNudgeReason;
}

/** Default cumulative-gap floor (pp). Tunable; justified in the spike doc. */
export const DEFAULT_GAP_FLOOR_PCT = 5;

/** Default rolling-window size in calendar days (one rolling quarter). */
export const DEFAULT_NUDGE_WINDOW_DAYS = 91;

/** One point of a cumulative-return series: `pct` is the cumulative return (%)
 *  since the series' own base date (e.g. `buildPortfolioTwr().series`). */
export interface NudgeWindowSeries {
  date: string;
  pct: number;
}

function dayMs(date: string): number {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime();
}

function daysBetween(a: string, b: string): number {
  return Math.round((dayMs(b) - dayMs(a)) / 86_400_000);
}

function addDays(date: string, days: number): string {
  return new Date(dayMs(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Per-window return (%) from two cumulative-return index levels:
 * `r = (1 + cumEnd/100) / (1 + cumStart/100) − 1`, expressed in %.
 * A wiped-out start (cumulative ≤ −100%, i.e. denominator ≤ 0) has no
 * meaningful ratio; the window return is reported as 0 (never triggers lag).
 */
function windowReturnPct(cumStart: number, cumEnd: number): number {
  const denom = 1 + cumStart / 100;
  if (denom <= 0) return 0;
  return ((1 + cumEnd / 100) / denom - 1) * 100;
}

/**
 * Slice two aligned cumulative-return series into rolling-quarter window
 * returns, ready to feed {@link evaluateIndexNudge}.
 *
 * Rules (all deliberate, in evaluation order):
 * 1. **Alignment** — only dates present in BOTH series are used, in ascending
 *    date order. Neither series is interpolated; a date missing from either
 *    side simply doesn't exist for windowing purposes.
 * 2. **Insufficient data** — fewer than 2 aligned points returns empty arrays
 *    (the caller's `evaluateIndexNudge` will then report "insufficient-data").
 * 3. **Window boundaries** — stepped every `windowDays` CALENDAR days from the
 *    first aligned date `d0`: boundaries at `d0 + k·windowDays`. Window `k`
 *    (k ≥ 1) runs from the previous window's endpoint to the last aligned
 *    point on or before boundary `k` — so windows are anchored to trading
 *    dates, never interpolated to exact calendar boundaries.
 * 4. **Per-window return** — converts the cumulative index difference into a
 *    per-window return: `r = (1 + cumEnd/100) / (1 + cumStart/100) − 1`, in %.
 *    Both series are windowed over the SAME dates, so the returns stay
 *    apples-to-apples. A window containing no new aligned points yields 0%
 *    for both sides (a tie — ends any lagging streak, conservatively).
 * 5. **Trailing partial window** — the span past the last full boundary is
 *    kept as a final window only when it covers at least half `windowDays`
 *    calendar days; a shorter tail is dropped (too noisy to count as a
 *    quarter). Boundary is inclusive: exactly half is kept.
 *
 * Returns oldest-first arrays, index-aligned, one entry per window — exactly
 * the shape {@link evaluateIndexNudge} consumes. The honesty contract at the
 * top of this file applies: `portfolioCum` MUST be TWR-derived.
 */
export interface AlignedCumSeries {
  portfolioCum: Array<{ date: string; pct: number }>;
  benchmarkCum: Array<{ date: string; pct: number }>;
}

/**
 * Align a cumulative-return TWR series (pct, e.g. from buildPortfolioTwr —
 * NEVER re-cumulated) with a benchmark price series on shared dates, and
 * geometrically rebase BOTH to the first common date. Returns null when
 * fewer than 2 dates overlap or a base is degenerate (≤ 0) — the caller
 * must treat null as "no verdict", never fall back to another basis.
 */
export function alignTwrWithBenchmark(
  twrSeries: Array<{ date: string; pct: number }>,
  bench: Array<{ date: string; value: number }>,
): AlignedCumSeries | null {
  const benchByDate = new Map(bench.map((p) => [p.date, p.value]));
  const alignedTwr = twrSeries.filter((p) => benchByDate.has(p.date));
  if (alignedTwr.length < 2) return null; // no usable date overlap → fixed-basket fallback
  const twrBase = 1 + alignedTwr[0].pct / 100;
  const benchBase = benchByDate.get(alignedTwr[0].date)!;
  if (twrBase <= 0 || benchBase <= 0) return null; // degenerate base → fallback
  const portfolioCum = alignedTwr.map((p) => ({
    date: p.date,
    pct: ((1 + p.pct / 100) / twrBase - 1) * 100,
  }));
  const benchmarkCum = alignedTwr.map((p) => ({
    date: p.date,
    pct: (benchByDate.get(p.date)! / benchBase - 1) * 100,
  }));
  return { portfolioCum, benchmarkCum };
}

export function buildIndexNudgeWindows(opts: {
  /** Portfolio cumulative-return series, e.g. `buildPortfolioTwr().series`. */
  portfolioCum: NudgeWindowSeries[];
  /** Benchmark cumulative-return series over (a superset of) the same dates. */
  benchmarkCum: NudgeWindowSeries[];
  /** Window size in calendar days. Default {@link DEFAULT_NUDGE_WINDOW_DAYS}. */
  windowDays?: number;
}): { portfolioReturns: number[]; benchmarkReturns: number[] } {
  const windowDays = opts.windowDays ?? DEFAULT_NUDGE_WINDOW_DAYS;
  const benchByDate = new Map(opts.benchmarkCum.map((p) => [p.date, p.pct]));
  const aligned = opts.portfolioCum
    .filter((p) => benchByDate.has(p.date))
    .map((p) => ({ date: p.date, port: p.pct, bench: benchByDate.get(p.date)! }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (aligned.length < 2 || windowDays <= 0) {
    return { portfolioReturns: [], benchmarkReturns: [] };
  }

  const d0 = aligned[0].date;
  const lastDate = aligned[aligned.length - 1].date;
  const totalDays = daysBetween(d0, lastDate);
  const fullWindows = Math.floor(totalDays / windowDays);
  const remainderDays = totalDays - fullWindows * windowDays;
  const keepPartial = remainderDays > 0 && remainderDays >= windowDays / 2;
  const windowCount = fullWindows + (keepPartial ? 1 : 0);

  const portfolioReturns: number[] = [];
  const benchmarkReturns: number[] = [];
  let prev = aligned[0];
  let cursor = 0;
  for (let k = 1; k <= windowCount; k += 1) {
    const boundary = k <= fullWindows ? addDays(d0, k * windowDays) : lastDate;
    while (cursor + 1 < aligned.length && aligned[cursor + 1].date <= boundary) cursor += 1;
    const endPoint = aligned[cursor];
    portfolioReturns.push(windowReturnPct(prev.port, endPoint.port));
    benchmarkReturns.push(windowReturnPct(prev.bench, endPoint.bench));
    prev = endPoint;
  }
  return { portfolioReturns, benchmarkReturns };
}

/**
 * Evaluate the index-nudge rule over pre-computed window returns.
 *
 * Boundary rules (both inclusive): triggers at EXACTLY `minWindows` consecutive
 * lagging windows and at EXACTLY `gapFloorPct` cumulative gap. "Lagging" in a
 * window is a STRICT inequality (portfolio < benchmark); an exact tie ends the
 * streak (treated as not-lagging), so a tie in the most recent window yields
 * reason "leading".
 *
 * If the two series differ in length (caller bug), only the first
 * `min(length)` windows are considered — the arrays are index-aligned from the
 * oldest (index 0), so callers must supply matching, same-window series.
 */
export function evaluateIndexNudge(input: IndexNudgeInput): IndexNudgeVerdict {
  const { portfolioReturns, benchmarkReturns } = input;
  const gapFloorPct = input.gapFloorPct ?? DEFAULT_GAP_FLOOR_PCT;
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);

  if (n < input.minWindows) {
    return {
      triggered: false,
      consecutiveLagging: 0,
      cumulativeGapPct: null,
      reason: "insufficient-data",
    };
  }

  // Count the trailing run of consecutive lagging windows (from most recent
  // backward) and accumulate its gap in the same pass.
  let consecutiveLagging = 0;
  let cumulativeGap = 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    const port = portfolioReturns[i];
    const bench = benchmarkReturns[i];
    if (port < bench) {
      consecutiveLagging += 1;
      cumulativeGap += bench - port;
    } else {
      break;
    }
  }

  if (consecutiveLagging === 0) {
    return { triggered: false, consecutiveLagging: 0, cumulativeGapPct: null, reason: "leading" };
  }

  const persistent = consecutiveLagging >= input.minWindows;
  const gapClears = cumulativeGap >= gapFloorPct;
  const triggered = persistent && gapClears;

  return {
    triggered,
    consecutiveLagging,
    cumulativeGapPct: cumulativeGap,
    reason: triggered ? "persistent-lag" : "lagging-not-persistent",
  };
}
