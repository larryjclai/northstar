/**
 * Index-Nudge detection prototype (roadmap 6.6 spike — plan 172).
 *
 * ── What this is ──────────────────────────────────────────────────────────────
 * A PURE detection rule for the「長期贏不了大盤就加入大盤」nudge. Given a
 * portfolio's rolling-window returns and the benchmark's returns over the SAME
 * windows, it decides whether the portfolio has lagged the benchmark *persistently
 * enough* that surfacing an "index" decision to the user is warranted.
 *
 * This module is deliberately consumed by NO UI. It is the decision prototype the
 * spike (docs/index-nudge-spike.md) recommends a build plan wire up later. It does
 * not fetch, compute, or transform any price/return series — the caller supplies
 * already-computed window returns, so this stays trivially testable and never
 * couples to the analytics engine's internals.
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
  | "insufficient-data"
  | "leading"
  | "lagging-not-persistent"
  | "persistent-lag";

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
    return { triggered: false, consecutiveLagging: 0, cumulativeGapPct: null, reason: "insufficient-data" };
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
