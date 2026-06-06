import type { DailyPrice, ManualPriceSnapshot } from "./types";

/**
 * Portfolio analytics engine — risk metrics and time-series used by the
 * Dashboard Portfolio Strip / Top Movers and the 投資 → 分析 tab.
 *
 * ── Correctness contract (read before changing any formula) ───────────────────
 *
 * Every series-derived metric here is built on a **fixed-basket** valuation:
 * we value your *current* holdings (today's share counts) at each date's
 * historical close, across the whole window, for *all* positions (no
 * acquisition-date filter), carrying the last known close forward over gaps.
 *
 * Why fixed-basket and not actual historical holdings?
 *   - It isolates **price return** from cash-flow contamination. If we used the
 *     real share count on each date, every buy would inject new capital and show
 *     up as a positive "return", and every sell as a negative one — corrupting
 *     volatility, Sharpe, Sortino, drawdown and the cumulative-return line.
 *   - A fixed basket answers the question these charts actually pose: "given the
 *     portfolio I hold today, how has it behaved / how risky is it?" — directly
 *     comparable to a benchmark's own price-only path.
 *
 * This is deliberately NOT:
 *   - money-weighted return (that is XIRR — see portfolioMetrics.ts, shown
 *     separately so the two never get conflated), nor
 *   - the net-worth trend (Dashboard uses buildNetWorthTrend with *historical*
 *     quantities + cash legs, because there the contributions ARE the point).
 *
 * All annualization assumes ~252 trading days/yr. Risk-free rate defaults to
 * 2.5%/yr. Volatility uses the sample standard deviation (n−1). Callers must
 * gate display on {@link hasEnoughReturns} so a handful of points never produces
 * a confident-looking but meaningless number (consistent with XIRR_MIN_DAYS).
 */

const EPS = 1e-9;

/** Trading days per year used for all annualization. */
export const TRADING_DAYS_PER_YEAR = 252;

/** Default annual risk-free rate (decimal) for Sharpe / Sortino. */
export const DEFAULT_RISK_FREE_RATE = 0.025;

/**
 * Minimum number of daily return observations before annualized risk metrics
 * are shown. Below this, annualizing is meaningless. Mirrors XIRR_MIN_DAYS so
 * the whole app gates short histories the same way.
 */
export const MIN_ANALYTICS_DAYS = 30;

/** True when there are enough return observations to show risk metrics. */
export function hasEnoughReturns(returns: number[]): boolean {
  return returns.length >= MIN_ANALYTICS_DAYS;
}

// ─── Primitive statistics ────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Sample standard deviation (n−1). Returns 0 for fewer than 2 observations. */
function sampleStd(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

// ─── Return series ───────────────────────────────────────────────────────────

/**
 * Simple period-over-period returns from a value series: r_i = v_i / v_{i-1} − 1.
 * A non-positive prior value can't yield a meaningful return, so that step is
 * skipped rather than producing ±Infinity.
 */
export function dailyReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1];
    if (prev > EPS) out.push(values[i] / prev - 1);
  }
  return out;
}

/** Cumulative return over the whole series, as a percentage. */
export function cumulativeReturnPct(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values[0];
  const last = values[values.length - 1];
  if (Math.abs(first) <= EPS) return 0;
  return (last / first - 1) * 100;
}

/**
 * Convert a value series into a cumulative-return index (percentage from the
 * first point), aligned 1:1 with the input dates. Used to overlay portfolio vs
 * benchmark on the same axis regardless of their absolute scales.
 */
export function toCumulativeReturnSeries(points: ValuePoint[]): Array<{ date: string; pct: number }> {
  if (points.length === 0) return [];
  const base = points[0].value;
  if (Math.abs(base) <= EPS) return points.map((p) => ({ date: p.date, pct: 0 }));
  return points.map((p) => ({ date: p.date, pct: (p.value / base - 1) * 100 }));
}

// ─── Annualized risk metrics ─────────────────────────────────────────────────

/** Annualized volatility (%) = sample σ of daily returns × √252. */
export function annualizedVolatilityPct(
  returns: number[],
  periodsPerYear = TRADING_DAYS_PER_YEAR,
): number | null {
  if (returns.length < 2) return null;
  return sampleStd(returns) * Math.sqrt(periodsPerYear) * 100;
}

/** Annualized arithmetic mean return (decimal) = mean(daily) × 252. */
export function annualizedReturn(
  returns: number[],
  periodsPerYear = TRADING_DAYS_PER_YEAR,
): number {
  return mean(returns) * periodsPerYear;
}

/**
 * Sharpe ratio = (annualized return − risk-free) / annualized volatility.
 * Null when there's no variance to divide by or too few observations.
 */
export function sharpeRatio(
  returns: number[],
  riskFreeAnnual = DEFAULT_RISK_FREE_RATE,
  periodsPerYear = TRADING_DAYS_PER_YEAR,
): number | null {
  if (returns.length < 2) return null;
  const annVol = sampleStd(returns) * Math.sqrt(periodsPerYear);
  if (annVol <= EPS) return null;
  return (annualizedReturn(returns, periodsPerYear) - riskFreeAnnual) / annVol;
}

/**
 * Sortino ratio = (annualized return − risk-free) / annualized downside
 * deviation. Downside deviation uses the minimum acceptable return (MAR) of the
 * per-period risk-free rate and averages squared shortfalls over *all*
 * observations (the standard Sortino denominator), then annualizes by √252.
 * Null when there is no downside dispersion (every return ≥ MAR) or too few
 * observations.
 */
export function sortinoRatio(
  returns: number[],
  riskFreeAnnual = DEFAULT_RISK_FREE_RATE,
  periodsPerYear = TRADING_DAYS_PER_YEAR,
): number | null {
  if (returns.length < 2) return null;
  const mar = riskFreeAnnual / periodsPerYear;
  const downsideMeanSq =
    returns.reduce((sum, r) => {
      const shortfall = Math.min(0, r - mar);
      return sum + shortfall * shortfall;
    }, 0) / returns.length;
  const downsideDev = Math.sqrt(downsideMeanSq) * Math.sqrt(periodsPerYear);
  if (downsideDev <= EPS) return null;
  return (annualizedReturn(returns, periodsPerYear) - riskFreeAnnual) / downsideDev;
}

export interface DrawdownResult {
  /** Most negative peak-to-trough decline as a percentage (≤ 0). */
  drawdownPct: number;
  peakIndex: number;
  troughIndex: number;
  peakDate: string | null;
  troughDate: string | null;
  /** True when the series recovered to the prior peak after the trough. */
  recovered: boolean;
}

/**
 * Maximum drawdown: the largest peak-to-trough decline over the series. Walks
 * the running peak and records the deepest relative trough below it, with its
 * peak/trough positions and whether the series later climbed back to that peak.
 */
export function maxDrawdown(values: number[], dates?: string[]): DrawdownResult {
  const empty: DrawdownResult = {
    drawdownPct: 0,
    peakIndex: 0,
    troughIndex: 0,
    peakDate: dates?.[0] ?? null,
    troughDate: dates?.[0] ?? null,
    recovered: true,
  };
  if (values.length < 2) return empty;

  let peakValue = values[0];
  let peakIdx = 0;
  let worst = 0; // most negative drawdown (decimal)
  let worstPeakIdx = 0;
  let worstTroughIdx = 0;

  for (let i = 1; i < values.length; i += 1) {
    const v = values[i];
    if (v > peakValue) {
      peakValue = v;
      peakIdx = i;
      continue;
    }
    if (peakValue > EPS) {
      const dd = v / peakValue - 1; // ≤ 0
      if (dd < worst) {
        worst = dd;
        worstPeakIdx = peakIdx;
        worstTroughIdx = i;
      }
    }
  }

  if (worst === 0) return empty;

  // Recovered if any point after the trough reaches the drawdown's peak value.
  const recoveryTarget = values[worstPeakIdx];
  let recovered = false;
  for (let i = worstTroughIdx + 1; i < values.length; i += 1) {
    if (values[i] >= recoveryTarget - EPS) {
      recovered = true;
      break;
    }
  }

  return {
    drawdownPct: worst * 100,
    peakIndex: worstPeakIdx,
    troughIndex: worstTroughIdx,
    peakDate: dates?.[worstPeakIdx] ?? null,
    troughDate: dates?.[worstTroughIdx] ?? null,
    recovered,
  };
}

/**
 * Rolling annualized volatility (%). For each return observation, the σ of the
 * trailing `window` returns × √252. Positions before a full window are null so
 * callers can align the result 1:1 with the return series without inventing
 * early values.
 */
export function rollingVolatilityPct(
  returns: number[],
  window = 30,
  periodsPerYear = TRADING_DAYS_PER_YEAR,
): Array<number | null> {
  return returns.map((_, i) => {
    if (i + 1 < window) return null;
    const slice = returns.slice(i + 1 - window, i + 1);
    return sampleStd(slice) * Math.sqrt(periodsPerYear) * 100;
  });
}

// ─── Fixed-basket valuation ──────────────────────────────────────────────────

export interface ValuePoint {
  /** YYYY-MM-DD */
  date: string;
  /** Total market value (primary currency) of the fixed basket on this date. */
  value: number;
}

/** Minimal position shape this engine needs (decoupled from repositories). */
export interface AnalyticsPosition {
  assetId: string;
  ticker: string;
  quantity: number;
  currency: string;
  /** Manual holdings price off snapshots (by assetId); tracked off daily_prices (by ticker). */
  isManual: boolean;
  /** Asset class label for allocation drift; optional. */
  assetClass?: string;
}

interface PricedBasket {
  /** Window dates with full coverage of every priced position, sorted asc. */
  dates: string[];
  /** Per-position value (primary currency) aligned to `dates`, keyed by a
   *  per-position key (assetId+accountless) — here just assetId index order. */
  positionValues: number[][];
  /** Positions kept (index-aligned with positionValues rows). */
  positions: AnalyticsPosition[];
  /** Positions dropped for having no price history in/near the window. */
  excluded: AnalyticsPosition[];
  /** Earliest date the full basket could be priced, or null when none. */
  coverageStart: string | null;
}

const day = (s: string) => s.slice(0, 10);

function latestOnOrBefore<T extends { date: string }>(sortedAsc: T[], date: string): T | null {
  for (let i = sortedAsc.length - 1; i >= 0; i -= 1) {
    if (sortedAsc[i].date <= date) return sortedAsc[i];
  }
  return null;
}

/**
 * Core fixed-basket pricer shared by the value series and allocation drift. For
 * each priced position it finds its price source (daily closes by ticker, or
 * manual snapshots by assetId), then values every position at every window date
 * ≥ the basket's coverage start, carrying the last close forward over gaps.
 *
 * Positions with no price history at all are excluded (and reported) rather than
 * silently contributing 0 — which would understate value and fake a jump when
 * their history begins.
 */
function priceBasket(opts: {
  positions: AnalyticsPosition[];
  dailyPrices: DailyPrice[];
  manualSnapshots: ManualPriceSnapshot[];
  toPrimary: (value: number, currency: string, asOf?: string) => number;
  start: string;
  end: string;
}): PricedBasket {
  const { positions, dailyPrices, manualSnapshots, toPrimary } = opts;
  const start = day(opts.start);
  const end = day(opts.end);
  const blank: PricedBasket = { dates: [], positionValues: [], positions: [], excluded: [], coverageStart: null };
  if (!start || !end || start > end) return blank;

  const held = positions.filter((p) => Math.abs(p.quantity) > EPS);

  // Price sources keyed for fast lookup; include history up to `end` so a close
  // before `start` can carry forward into the window.
  const pricesByTicker = new Map<string, DailyPrice[]>();
  for (const row of dailyPrices) {
    if (day(row.date) > end) continue;
    const key = row.ticker.toUpperCase();
    (pricesByTicker.get(key) ?? pricesByTicker.set(key, []).get(key)!).push(row);
  }
  for (const rows of pricesByTicker.values()) rows.sort((a, b) => a.date.localeCompare(b.date));

  const snapsByAsset = new Map<string, ManualPriceSnapshot[]>();
  for (const snap of manualSnapshots) {
    if (day(snap.date) > end) continue;
    (snapsByAsset.get(snap.assetId) ?? snapsByAsset.set(snap.assetId, []).get(snap.assetId)!).push(snap);
  }
  for (const rows of snapsByAsset.values()) rows.sort((a, b) => a.date.localeCompare(b.date));

  // Resolve each position's source list and first available date.
  interface Priced { pos: AnalyticsPosition; source: Array<{ date: string; price: number }>; firstDate: string }
  const priced: Priced[] = [];
  const excluded: AnalyticsPosition[] = [];
  for (const pos of held) {
    const source = pos.isManual
      ? (snapsByAsset.get(pos.assetId) ?? []).map((s) => ({ date: day(s.date), price: s.price }))
      : (pricesByTicker.get(pos.ticker.toUpperCase()) ?? []).map((p) => ({ date: day(p.date), price: p.close }));
    if (source.length === 0) {
      excluded.push(pos);
      continue;
    }
    priced.push({ pos, source, firstDate: source[0].date });
  }
  if (priced.length === 0) return { ...blank, excluded };

  // Coverage start = the latest "first price" across the basket: only from here
  // on can every component be priced (via carry-forward), giving a clean index.
  const coverageStart = priced.reduce((mx, p) => (p.firstDate > mx ? p.firstDate : mx), priced[0].firstDate);
  const effectiveStart = coverageStart > start ? coverageStart : start;
  if (effectiveStart > end) return { ...blank, excluded, coverageStart };

  // Candidate dates = union of all source dates within [effectiveStart, end].
  const dateSet = new Set<string>();
  for (const p of priced) {
    for (const s of p.source) {
      if (s.date >= effectiveStart && s.date <= end) dateSet.add(s.date);
    }
  }
  const dates = [...dateSet].sort();
  if (dates.length === 0) return { ...blank, excluded, coverageStart };

  const positionValues = priced.map(({ pos, source }) =>
    dates.map((date) => {
      const hit = latestOnOrBefore(source, date)!; // guaranteed: date ≥ coverageStart ≥ firstDate
      return toPrimary(hit.price * pos.quantity, pos.currency, date);
    }),
  );

  return { dates, positionValues, positions: priced.map((p) => p.pos), excluded, coverageStart };
}

export interface PortfolioValueSeries {
  series: ValuePoint[];
  excludedTickers: string[];
  coverageStart: string | null;
}

/**
 * Fixed-basket market value of the current holdings over [start, end]. See the
 * module contract for why this isolates price return from contributions. The
 * series is trimmed to where every (priced) position has a price, and positions
 * with no price history are excluded and reported for disclosure.
 */
export function buildPortfolioValueSeries(opts: {
  positions: AnalyticsPosition[];
  dailyPrices: DailyPrice[];
  manualSnapshots: ManualPriceSnapshot[];
  toPrimary: (value: number, currency: string, asOf?: string) => number;
  start: string;
  end: string;
}): PortfolioValueSeries {
  const basket = priceBasket(opts);
  const series = basket.dates.map((date, t) => ({
    date,
    value: basket.positionValues.reduce((sum, row) => sum + row[t], 0),
  }));
  return {
    series,
    excludedTickers: [...new Set(basket.excluded.map((p) => p.ticker))],
    coverageStart: basket.coverageStart,
  };
}

/**
 * Benchmark value series (a single ticker's daily closes within the window).
 * Returned raw — cumulative return is scale-free, so no FX conversion needed.
 */
export function buildBenchmarkSeries(
  dailyPrices: DailyPrice[],
  ticker: string,
  start: string,
  end: string,
): ValuePoint[] {
  const t = ticker.toUpperCase();
  const s = day(start);
  const e = day(end);
  return dailyPrices
    .filter((p) => p.ticker.toUpperCase() === t && day(p.date) >= s && day(p.date) <= e)
    .map((p) => ({ date: day(p.date), value: p.close }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Restrict two series to their common dates, preserving order. Used to overlay
 * portfolio vs benchmark cumulative returns on the same dates before indexing,
 * so both lines start from the same baseline date.
 */
export function alignByDate(a: ValuePoint[], b: ValuePoint[]): { a: ValuePoint[]; b: ValuePoint[] } {
  const bDates = new Set(b.map((p) => p.date));
  const aDates = new Set(a.map((p) => p.date));
  return {
    a: a.filter((p) => bDates.has(p.date)),
    b: b.filter((p) => aDates.has(p.date)),
  };
}

// ─── Allocation drift ────────────────────────────────────────────────────────

export interface AllocationDriftSeries {
  dates: string[];
  /** Class labels, ordered for stable stacking/legend. */
  classes: string[];
  /** data[t][c] = class c's % weight of the basket on dates[t] (sums to ~100). */
  data: number[][];
  excludedTickers: string[];
}

/**
 * Class-weight drift of the *current* basket over time. Values each holding at
 * historical prices (fixed basket), groups by `assetClass`, and expresses each
 * class as a percentage of the basket on each date. Because the basket is fixed,
 * the drift reflects relative price moves between classes (the thing a
 * rebalancing view cares about), not contributions.
 */
export function allocationDriftSeries(opts: {
  positions: AnalyticsPosition[];
  dailyPrices: DailyPrice[];
  manualSnapshots: ManualPriceSnapshot[];
  toPrimary: (value: number, currency: string, asOf?: string) => number;
  start: string;
  end: string;
}): AllocationDriftSeries {
  const basket = priceBasket(opts);
  const excludedTickers = [...new Set(basket.excluded.map((p) => p.ticker))];
  if (basket.dates.length === 0) return { dates: [], classes: [], data: [], excludedTickers };

  const classOf = (p: AnalyticsPosition) => p.assetClass ?? "其他";
  const classes = [...new Set(basket.positions.map(classOf))];
  const classIndex = new Map(classes.map((c, i) => [c, i]));

  const data = basket.dates.map((_, t) => {
    const byClass = new Array(classes.length).fill(0);
    let total = 0;
    basket.positionValues.forEach((row, i) => {
      const v = row[t];
      byClass[classIndex.get(classOf(basket.positions[i]))!] += v;
      total += v;
    });
    return total > EPS ? byClass.map((v) => (v / total) * 100) : byClass;
  });

  return { dates: basket.dates, classes, data, excludedTickers };
}

// ─── Top movers ──────────────────────────────────────────────────────────────

export interface MoverQuote {
  symbol: string;
  changePercent: number;
  name?: string | null;
  marketTime?: string | null;
}

export interface Mover {
  ticker: string;
  name: string;
  changePercent: number;
  marketTime: string | null;
}

/**
 * Today's biggest movers among *held* tickers, sorted best → worst. Driven by
 * each quote's real `changePercent` (day move vs previous close). Tickers with
 * no quote are simply absent. `nameFor` lets callers supply a localized holding
 * name; otherwise the quote's own name (or ticker) is used.
 */
export function topMovers(
  quotes: MoverQuote[],
  heldTickers: Iterable<string>,
  opts?: { limit?: number; nameFor?: (ticker: string) => string | null | undefined },
): Mover[] {
  const held = new Set([...heldTickers].map((t) => t.toUpperCase()));
  const limit = opts?.limit ?? 7;
  return quotes
    .filter((q) => held.has(q.symbol.toUpperCase()) && Number.isFinite(q.changePercent))
    .map((q) => ({
      ticker: q.symbol,
      name: opts?.nameFor?.(q.symbol) || q.name || q.symbol,
      changePercent: q.changePercent,
      marketTime: q.marketTime ?? null,
    }))
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, limit);
}
