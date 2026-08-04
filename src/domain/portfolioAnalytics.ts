import type { DailyPriceSeriesRow, InvestmentRecord, ManualPriceSnapshot } from "./types";
import { buildQuoteLookup, findQuoteForTicker, quoteLookupKeys } from "./marketSymbols";
import { buildPositionMetrics, buildQuantityTimeline } from "./portfolioMetrics";
import { toCanonicalSector } from "./canonicalSector";

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
export function toCumulativeReturnSeries(
  points: ValuePoint[],
): Array<{ date: string; pct: number }> {
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
  /** Display-name fallback for no-ticker (custom) assets; optional. */
  name?: string;
  quantity: number;
  currency: string;
  /** Fallback cost per share for legacy/manual positions without records. */
  averageCost?: number;
  /** Manual holdings price off snapshots (by assetId); tracked off daily_prices (by ticker). */
  isManual: boolean;
  /** Asset class label for allocation drift; optional. */
  assetClass?: string;
  /** Raw sector value (TWSE code or English GICS name); optional. */
  sector?: string | null;
  /**
   * Persisted canonical (coarse) GICS-11 key (plan 070). The default sector
   * breakdown groups by this so TW (TWSE code) and US (Yahoo GICS) holdings land
   * in one cross-market taxonomy. Absent ⇒ the breakdown derives it from
   * `sector`/`industry` on the fly (covers legacy rows). Optional.
   */
  sectorCanonical?: string | null;
  /** Fine source industry (TWSE/Yahoo); used by the `level: "industry"` drill-down. Optional. */
  industry?: string | null;
  /** Asset type (equity / etf / mutual_fund / …); drives the ETF/fund bucket. */
  assetType?: import("./types").AssetType | null;
  /**
   * True when the user hand-edited this asset's classification (069 lock). A
   * locked `sector` is treated as the manual tag and takes precedence over any
   * fetched/derived bucket. Absent/false ⇒ unlocked.
   */
  classificationLocked?: boolean;
  /**
   * Optional per-holding sector weights `{ sector, weight }[]` (Tier-1 ETF
   * enrichment). Present only when *trustworthy* weights exist; the breakdown
   * then splits this position's value across buckets (weighted multi-bucket),
   * else the position lands wholesale in the 「ETF / 基金」 bucket.
   */
  sectorWeights?: Array<{ sector: string; weight: number }> | null;
}

// ─── Sector / country breakdown (plan 068) ───────────────────────────────────

/**
 * One slice of a by-dimension breakdown (sector or country). Bucket values sum
 * to the priced portfolio total, so each dimension reconciles independently:
 * Σ buckets = portfolio value. A holding may appear in a sector bucket *and* a
 * country bucket — that's two orthogonal views, not double-counting.
 */
export interface BreakdownBucket {
  /** Stable key (e.g. resolved label) used for grouping. */
  label: string;
  value: number;
  /** Share of the total (%). */
  pct: number;
}

export interface Breakdown {
  buckets: BreakdownBucket[];
  total: number;
}

/** Minimal priced-position input for the breakdowns (decoupled from valuation). */
export interface BreakdownEntry {
  position: AnalyticsPosition;
  /** Current value in the primary currency (already converted). */
  value: number;
}

function finalizeBuckets(byLabel: Map<string, number>, total: number): Breakdown {
  const buckets = [...byLabel.entries()]
    .map(([label, value]) => ({ label, value, pct: total > EPS ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  return { buckets, total };
}

/**
 * Sector breakdown that attributes value by Decision A:
 * - **manual > fetched > bucket** precedence.
 * - A direct holding with a sector → that sector.
 * - An ETF/fund with **trustworthy `sectorWeights`** → value split across those
 *   sectors (renormalized; any shortfall to 100% goes to an 「其他」 remainder).
 * - An ETF/fund without weights (or any classification-locked manual tag absent)
 *   → the single 「ETF / 基金」 bucket (`etfBucket` label), never 未知.
 * - A non-ETF holding with no sector → the supplied `unknownLabel`.
 *
 * **Taxonomy (plan 070).** By DEFAULT (`level: "canonical"`) every sector value —
 * a direct holding's, a manual locked tag, and each ETF weight slice — is collapsed
 * onto the canonical GICS-11 taxonomy via `toCanonicalSector`, so TW (TWSE code)
 * and US (Yahoo GICS) holdings land in ONE coherent bucket (e.g. 半導體 + Technology
 * → 資訊科技). `level: "industry"` keeps the fine TWSE/Yahoo industry split for a
 * drill-down. Either way Σ buckets = Σ priced values.
 */
export function buildSectorBreakdown(
  entries: BreakdownEntry[],
  opts: {
    /** Resolve a raw sector value (TWSE code / GICS) → fine display label, or null. */
    sectorLabelOf: (raw: string | null | undefined) => string | null;
    /**
     * Resolve a canonical GICS-11 key (e.g. "technology") → display label. Required
     * for the default canonical level; ignored when `level: "industry"`.
     */
    canonicalLabelOf?: (key: string | null | undefined) => string | null;
    /** Grouping level. Default "canonical" (cross-market); "industry" = fine split. */
    level?: "canonical" | "industry";
    /** Label for the ETF/fund default bucket. */
    etfBucket: string;
    /** Label for a 未知-sector non-ETF holding. */
    unknownLabel: string;
    /** Label for the renormalization remainder when weights don't reach 100%. */
    otherLabel: string;
    /** Treat weights ≥ this share-sum (0–1) as trustworthy; else use the bucket. */
    minTrustworthyCoverage?: number;
  },
): Breakdown {
  const { sectorLabelOf, canonicalLabelOf, etfBucket, unknownLabel, otherLabel } = opts;
  const level = opts.level ?? "canonical";
  const minCoverage = opts.minTrustworthyCoverage ?? 0.5;
  const byLabel = new Map<string, number>();
  let total = 0;
  const add = (label: string, value: number) =>
    byLabel.set(label, (byLabel.get(label) ?? 0) + value);

  // Resolve one raw sector value to a bucket label for the active level. For the
  // canonical level we map through `toCanonicalSector` first (with an optional
  // pre-derived canonical key, e.g. a direct holding's persisted `sectorCanonical`),
  // then localize via `canonicalLabelOf`. Returns null when it can't classify.
  const labelFor = (
    raw: string | null | undefined,
    presetCanonical?: string | null,
  ): string | null => {
    if (level === "industry") return sectorLabelOf(raw);
    const key = presetCanonical ?? toCanonicalSector({ sector: raw });
    if (!key) return null;
    return (canonicalLabelOf?.(key) ?? key) || null;
  };

  for (const { position, value } of entries) {
    if (!(value > EPS)) continue;
    total += value;

    const isFund =
      position.assetType === "etf" ||
      position.assetType === "mutual_fund" ||
      position.assetType === "index";
    const manualSector = position.classificationLocked ? labelFor(position.sector) : null;

    // 1) Manual tag wins outright (mapped through the active taxonomy).
    if (manualSector) {
      add(manualSector, value);
      continue;
    }

    // 2) A fund with trustworthy fetched weights splits across buckets.
    const weights = position.sectorWeights ?? [];
    const coverage = weights.reduce((s, w) => s + Math.max(0, w.weight), 0);
    if (isFund && weights.length > 0 && coverage >= minCoverage) {
      // Renormalize so the split sums to exactly `value`, sending any gap below
      // 100% to an 「其他」 remainder (keeps Σ = value even with partial coverage).
      const norm = coverage > 1 + EPS ? coverage : 1;
      let attributed = 0;
      for (const w of weights) {
        const share = Math.max(0, w.weight) / norm;
        const slice = value * share;
        const label = labelFor(w.sector) ?? w.sector ?? otherLabel;
        add(label, slice);
        attributed += slice;
      }
      const remainder = value - attributed;
      if (remainder > EPS) add(otherLabel, remainder);
      continue;
    }

    // 3) Any fund without trustworthy weights → the explicit ETF/fund bucket.
    if (isFund) {
      add(etfBucket, value);
      continue;
    }

    // 4) A direct holding uses its own sector (canonical level prefers the
    //    persisted `sectorCanonical`, deriving from raw when absent), else 未知.
    const direct =
      level === "canonical"
        ? labelFor(
            position.sector,
            position.sectorCanonical ??
              toCanonicalSector({ sector: position.sector, industry: position.industry }),
          )
        : sectorLabelOf(position.sector);
    add(direct ?? unknownLabel, value);
  }

  return finalizeBuckets(byLabel, total);
}

/**
 * Country breakdown of *direct* holdings, derived locally (no fetch) via
 * `countryOf` (ticker-suffix/market → country, currency tiebreak). ETFs without
 * fetched country weights fall to the supplied `unknownLabel` (or a manual tag,
 * if locked + `countryOf` resolves the tag). Σ buckets = Σ priced values.
 */
export function buildCountryBreakdown(
  entries: BreakdownEntry[],
  opts: {
    /** Resolve a position → display country label (never null; uses placeholder). */
    countryOf: (position: AnalyticsPosition) => string;
  },
): Breakdown {
  const byLabel = new Map<string, number>();
  let total = 0;
  for (const { position, value } of entries) {
    if (!(value > EPS)) continue;
    total += value;
    const label = opts.countryOf(position);
    byLabel.set(label, (byLabel.get(label) ?? 0) + value);
  }
  return finalizeBuckets(byLabel, total);
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
  dailyPrices: DailyPriceSeriesRow[];
  manualSnapshots: ManualPriceSnapshot[];
  toPrimary: (value: number, currency: string, asOf?: string) => number;
  start: string;
  end: string;
}): PricedBasket {
  const { positions, dailyPrices, manualSnapshots, toPrimary } = opts;
  const start = day(opts.start);
  const end = day(opts.end);
  const blank: PricedBasket = {
    dates: [],
    positionValues: [],
    positions: [],
    excluded: [],
    coverageStart: null,
  };
  if (!start || !end || start > end) return blank;

  const held = positions.filter((p) => Math.abs(p.quantity) > EPS);

  // Price sources keyed for fast lookup; include history up to `end` so a close
  // before `start` can carry forward into the window.
  const pricesByTicker = new Map<string, DailyPriceSeriesRow[]>();
  for (const row of dailyPrices) {
    if (day(row.date) > end) continue;
    const key = row.ticker.toUpperCase();
    (pricesByTicker.get(key) ?? pricesByTicker.set(key, []).get(key)!).push(row);
  }
  for (const rows of pricesByTicker.values()) rows.sort((a, b) => a.date.localeCompare(b.date));

  const snapsByAsset = new Map<string, ManualPriceSnapshot[]>();
  for (const snap of manualSnapshots) {
    if (day(snap.date) > end) continue;
    (snapsByAsset.get(snap.assetId) ?? snapsByAsset.set(snap.assetId, []).get(snap.assetId)!).push(
      snap,
    );
  }
  for (const rows of snapsByAsset.values()) rows.sort((a, b) => a.date.localeCompare(b.date));

  // Resolve each position's price source. Prefer real market history by *ticker*
  // — this is the key fix for manual holdings: a manually-tracked lot of a listed
  // ticker (e.g. 2330.TW) should use its backfilled daily_prices, exactly like a
  // transaction-based holding, instead of its lone creation snapshot. Manual
  // snapshots are only the fallback for genuinely non-market assets (no ticker
  // history at all, e.g. real estate). `isManual` no longer gates this.
  interface Priced {
    pos: AnalyticsPosition;
    source: Array<{ date: string; price: number }>;
    firstDate: string;
  }
  const priced: Priced[] = [];
  const excluded: AnalyticsPosition[] = [];
  for (const pos of held) {
    const tickerHistory = (pricesByTicker.get(pos.ticker.toUpperCase()) ?? []).map((p) => ({
      date: day(p.date),
      price: p.close,
    }));
    const snapHistory = (snapsByAsset.get(pos.assetId) ?? []).map((s) => ({
      date: day(s.date),
      price: s.price,
    }));
    const source =
      tickerHistory.length >= 2
        ? tickerHistory
        : snapHistory.length > 0
          ? snapHistory
          : tickerHistory;
    if (source.length === 0) {
      excluded.push(pos);
      continue;
    }
    priced.push({ pos, source, firstDate: source[0].date });
  }
  if (priced.length === 0) return { ...blank, excluded };

  // Naively pinning the window to the latest "first price" lets a single new or
  // sparsely-priced holding (e.g. a manual lot with one recent snapshot, or a
  // freshly bought ticker) collapse the entire series. Instead, value-weight the
  // basket and pick the earliest start from which positions covering at least
  // COVERAGE_THRESHOLD of basket value already have prices. Newer positions are
  // excluded from the (still fixed) basket and reported, rather than truncating
  // everyone to their short history.
  const COVERAGE_THRESHOLD = 0.7;
  const weightOf = (p: Priced) =>
    Math.max(
      0,
      toPrimary(p.source[p.source.length - 1].price * p.pos.quantity, p.pos.currency, end),
    );
  const totalWeight = priced.reduce((s, p) => s + weightOf(p), 0);
  const byFirstDate = [...priced].sort((a, b) => a.firstDate.localeCompare(b.firstDate));
  let thresholdStart = byFirstDate[byFirstDate.length - 1].firstDate; // fallback: require all
  if (totalWeight > EPS) {
    let cum = 0;
    for (const p of byFirstDate) {
      cum += weightOf(p);
      if (cum >= COVERAGE_THRESHOLD * totalWeight) {
        thresholdStart = p.firstDate;
        break;
      }
    }
  }
  const effectiveStart = thresholdStart > start ? thresholdStart : start;
  if (effectiveStart > end) return { ...blank, excluded, coverageStart: effectiveStart };

  // Spanning positions can be priced across the whole window; newer ones are
  // excluded (disclosed) so the basket stays fixed and contamination-free.
  const spanning = priced.filter((p) => p.firstDate <= effectiveStart);
  for (const p of priced) if (p.firstDate > effectiveStart) excluded.push(p.pos);
  if (spanning.length === 0) return { ...blank, excluded, coverageStart: effectiveStart };

  // Candidate dates = union of spanning positions' source dates within window.
  const dateSet = new Set<string>();
  for (const p of spanning) {
    for (const s of p.source) {
      if (s.date >= effectiveStart && s.date <= end) dateSet.add(s.date);
    }
  }
  const dates = [...dateSet].sort();
  if (dates.length === 0) return { ...blank, excluded, coverageStart: effectiveStart };

  const positionValues = spanning.map(({ pos, source }) =>
    dates.map((date) => {
      const hit = latestOnOrBefore(source, date)!; // guaranteed: date ≥ effectiveStart ≥ firstDate
      return toPrimary(hit.price * pos.quantity, pos.currency, date);
    }),
  );

  return {
    dates,
    positionValues,
    positions: spanning.map((p) => p.pos),
    excluded,
    coverageStart: effectiveStart,
  };
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
  dailyPrices: DailyPriceSeriesRow[];
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

// ─── Return attribution ──────────────────────────────────────────────────────

export interface AttributionItem {
  assetId: string;
  ticker: string;
  /** Period gain/loss this holding contributed (primary currency). */
  contribution: number;
  /** Share of the total period gain (%). Signed; sums to ~100 when total ≠ 0. */
  pct: number;
  /**
   * This holding's own price return over the period (%):
   * (value_end − value_start) / value_start. Always shares the sign of
   * `contribution` (up holdings positive, down holdings negative), so it reads
   * intuitively next to the TWD figure — unlike `pct`, whose sign flips when the
   * portfolio's total period move is negative.
   */
  returnPct: number;
}

export interface ReturnAttribution {
  items: AttributionItem[];
  /** Total period gain across all priced positions = Σ contributions. */
  total: number;
  excludedTickers: string[];
}

export interface CostBasisAttributionItem {
  assetId: string;
  ticker: string;
  /** Current market value in primary currency. */
  marketValue: number;
  /** Remaining moving-average cost basis in primary currency. */
  costBasis: number;
  /** Unrealized gain/loss = marketValue - costBasis. */
  contribution: number;
  /** Unrealized return on this holding's own cost basis (%). */
  pct: number;
}

export interface CostBasisAttribution {
  items: CostBasisAttributionItem[];
  /** Total unrealized gain across all priced positions. */
  total: number;
  excludedTickers: string[];
}

/**
 * Per-holding contribution to the portfolio's period gain, on the same
 * fixed-basket valuation as {@link buildPortfolioValueSeries} — so the
 * contributions sum exactly to the basket's period value change (and match the
 * "期間市值變化" figure). Answers "which holdings drove the result?".
 *
 * Contribution = current shares × (price_end − price_start) in primary,
 * isolating price movement from contributions just like the rest of the engine.
 * Sorted by absolute contribution (biggest movers first).
 */
export function buildReturnAttribution(opts: {
  positions: AnalyticsPosition[];
  dailyPrices: DailyPriceSeriesRow[];
  manualSnapshots: ManualPriceSnapshot[];
  toPrimary: (value: number, currency: string, asOf?: string) => number;
  start: string;
  end: string;
}): ReturnAttribution {
  const basket = priceBasket(opts);
  const lastIdx = basket.dates.length - 1;
  const items: AttributionItem[] = [];
  let total = 0;
  if (lastIdx >= 1) {
    basket.positions.forEach((pos, i) => {
      const row = basket.positionValues[i];
      const startValue = row[0];
      const contribution = row[lastIdx] - startValue;
      const returnPct = Math.abs(startValue) > EPS ? (contribution / startValue) * 100 : 0;
      total += contribution;
      items.push({ assetId: pos.assetId, ticker: pos.ticker, contribution, pct: 0, returnPct });
    });
  }
  for (const item of items)
    item.pct = Math.abs(total) > EPS ? (item.contribution / total) * 100 : 0;
  items.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return {
    items,
    total,
    excludedTickers: [...new Set(basket.excluded.map((p) => p.ticker))],
  };
}

/**
 * Current holding movers on the same moving-average cost basis used by the
 * Holdings table. This answers "which holdings are up/down versus my cost?"
 * rather than "which prices moved most during the selected period?".
 */
export function buildCostBasisAttribution(opts: {
  positions: AnalyticsPosition[];
  records: InvestmentRecord[];
  dailyPrices: DailyPriceSeriesRow[];
  manualSnapshots: ManualPriceSnapshot[];
  toPrimary: (value: number, currency: string, asOf?: string) => number;
  end: string;
}): CostBasisAttribution {
  const { positions, records, dailyPrices, manualSnapshots, toPrimary } = opts;
  const end = day(opts.end);
  const recordsByAsset = new Map<string, InvestmentRecord[]>();
  for (const record of records) {
    if (record.deletedAt !== null) continue;
    const rows = recordsByAsset.get(record.assetId) ?? [];
    rows.push(record);
    recordsByAsset.set(record.assetId, rows);
  }

  const latestDailyPrice = (ticker: string): DailyPriceSeriesRow | null => {
    let best: DailyPriceSeriesRow | null = null;
    const key = ticker.toUpperCase();
    for (const row of dailyPrices) {
      if (row.ticker.toUpperCase() !== key || day(row.date) > end) continue;
      if (!best || row.date.localeCompare(best.date) > 0) best = row;
    }
    return best;
  };

  const latestManualSnapshot = (assetId: string): ManualPriceSnapshot | null => {
    let best: ManualPriceSnapshot | null = null;
    for (const row of manualSnapshots) {
      if (row.assetId !== assetId || day(row.date) > end) continue;
      if (!best || row.date.localeCompare(best.date) > 0) best = row;
    }
    return best;
  };

  const items: CostBasisAttributionItem[] = [];
  const excludedTickers: string[] = [];
  let total = 0;

  for (const position of positions) {
    if (Math.abs(position.quantity) <= EPS) continue;

    const price = latestDailyPrice(position.ticker);
    const snap = price ? null : latestManualSnapshot(position.assetId);
    if (!price && !snap) {
      excludedTickers.push(position.ticker);
      continue;
    }

    const priceValue = price?.close ?? snap!.price;
    // `||` not `??`: synced daily-price rows can carry an empty-string currency,
    // which `??` would keep — sending "" into the FX converter yields 0 (no rate)
    // → marketValue 0 → every holding shows −100%. Fall back to the position
    // currency on empty too, matching latestPositionValue() in the tab.
    const priceCurrency = price?.currency || position.currency;
    const priceDate = price?.date ?? snap!.date;
    const marketValue = toPrimary(priceValue * position.quantity, priceCurrency, priceDate);

    const metrics = buildPositionMetrics(recordsByAsset.get(position.assetId) ?? []);
    const rawCostBasis =
      Math.abs(metrics.costBasis) > EPS
        ? metrics.costBasis
        : (position.averageCost ?? 0) * position.quantity;
    const costBasis = toPrimary(rawCostBasis, position.currency, end);
    const contribution = marketValue - costBasis;
    const pct = Math.abs(costBasis) > EPS ? (contribution / costBasis) * 100 : 0;
    total += contribution;
    items.push({
      assetId: position.assetId,
      ticker: position.ticker,
      marketValue,
      costBasis,
      contribution,
      pct,
    });
  }

  items.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { items, total, excludedTickers: [...new Set(excludedTickers)] };
}

// ─── True time-weighted return (TWR) ─────────────────────────────────────────

export interface PortfolioTwr {
  /** Cumulative TWR (%) over the window, or null when too few observations. */
  twrPct: number | null;
  /** Cumulative TWR index as a return % per date, for charting / benchmark overlay. */
  series: Array<{ date: string; pct: number }>;
  /** Daily return observations actually chained (where prior value > 0). */
  observations: number;
  /** Held tickers with no usable price history in the window (disclosed). */
  excludedTickers: string[];
}

/**
 * True time-weighted return of the current holdings, using their **historical**
 * share counts (not the fixed basket). TWR removes the effect of when capital
 * was added or withdrawn, so it measures investing skill rather than cash-flow
 * timing — the opposite question from XIRR (money-weighted), and shown beside it.
 *
 * Method — daily-valuation TWR with income:
 *   r_t = (V_t − V_{t−1} − contribution_t + income_t) / V_{t−1},  TWR = Π(1+r_t) − 1
 * where V is the securities value (Σ historical shares × close, in primary),
 * contributions are buys (+) / sells & cash capital-reductions (−), and income
 * is cash dividends (added back so total return includes them). A buy raises V
 * and contribution together, so it nets to ~0 return that day — that is the
 * cash-flow neutrality TWR is prized for.
 *
 * Scope (v1): the currently-held basket's transaction history. Fully-exited
 * positions are out of scope (no current ticker/currency to value); held
 * tickers with no price history are excluded and disclosed. Gated on
 * {@link MIN_ANALYTICS_DAYS} like every other annualizable metric.
 */
export function buildPortfolioTwr(opts: {
  positions: AnalyticsPosition[];
  records: InvestmentRecord[];
  dailyPrices: DailyPriceSeriesRow[];
  toPrimary: (value: number, currency: string, asOf?: string) => number;
  start: string;
  end: string;
}): PortfolioTwr {
  const { positions, records, dailyPrices, toPrimary } = opts;
  const start = day(opts.start);
  const end = day(opts.end);

  const posById = new Map(positions.map((p) => [p.assetId, p]));
  const assetIds = new Set(posById.keys());
  const heldTickers = new Set(positions.map((p) => p.ticker.toUpperCase()));

  // Per-ticker close series (≤ end so the opening date can be valued from a
  // prior close), sorted ascending.
  const closesByTicker = new Map<string, Array<{ date: string; price: number }>>();
  for (const p of dailyPrices) {
    const t = p.ticker.toUpperCase();
    if (!heldTickers.has(t) || day(p.date) > end) continue;
    let arr = closesByTicker.get(t);
    if (!arr) {
      arr = [];
      closesByTicker.set(t, arr);
    }
    arr.push({ date: day(p.date), price: p.close });
  }
  for (const arr of closesByTicker.values()) arr.sort((a, b) => a.date.localeCompare(b.date));

  // Per-asset cumulative share step function from the canonical quantity timeline.
  const sharesByAsset = new Map<string, Array<{ date: string; qty: number }>>();
  for (const id of assetIds) {
    let cum = 0;
    const steps = buildQuantityTimeline(records.filter((r) => r.assetId === id)).map((d) => {
      cum += d.delta;
      return { date: d.date, qty: cum };
    });
    sharesByAsset.set(id, steps);
  }
  const sharesAt = (assetId: string, d: string): number => {
    const steps = sharesByAsset.get(assetId);
    if (!steps) return 0;
    let q = 0;
    for (const s of steps) {
      if (s.date <= d) q = s.qty;
      else break;
    }
    return q;
  };
  const closeOnOrBefore = (ticker: string, d: string): number | null => {
    const arr = closesByTicker.get(ticker);
    if (!arr) return null;
    const hit = latestOnOrBefore(arr, d);
    return hit ? hit.price : null;
  };

  const excludedTickers = [...heldTickers].filter((t) => !closesByTicker.has(t));

  // Valuation grid: in-window trading dates across held tickers.
  const gridSet = new Set<string>();
  for (const arr of closesByTicker.values()) {
    for (const c of arr) if (c.date >= start && c.date <= end) gridSet.add(c.date);
  }
  const grid = [...gridSet].sort();
  if (grid.length < 2) return { twrPct: null, series: [], observations: 0, excludedTickers };

  const valueOn = (d: string): number => {
    let v = 0;
    for (const p of positions) {
      const qty = sharesAt(p.assetId, d);
      if (Math.abs(qty) < EPS) continue;
      const close = closeOnOrBefore(p.ticker.toUpperCase(), d);
      if (close == null) continue;
      v += toPrimary(close * qty, p.currency, d);
    }
    return v;
  };

  // First grid date a ticker is priced at — contributions are aligned here so a
  // buy whose price history starts mid-window doesn't fake a loss-then-jump.
  const firstPricedGrid = (ticker: string): string | null => {
    for (const g of grid) if (closeOnOrBefore(ticker, g) != null) return g;
    return null;
  };
  const gridOnOrAfter = (d: string): string | null => {
    for (const g of grid) if (g >= d) return g;
    return null;
  };

  // Contributions (buy +, sell/cash-reduction −) and income (cash dividends),
  // bucketed to the first in-window grid date ≥ the record date, advanced to
  // where the ticker is actually priced.
  const contribByDate = new Map<string, number>();
  const incomeByDate = new Map<string, number>();
  for (const r of records) {
    if (!assetIds.has(r.assetId) || r.deletedAt !== null) continue;
    const rd = day(r.date);
    // Pre-window flows are already baked into the opening value; skip them.
    if (rd < start || rd > end) continue;
    const pos = posById.get(r.assetId)!;
    const t = pos.ticker.toUpperCase();
    // Excluded tickers (no daily price history) contribute neither value nor
    // flows — counting their cash flows without a matching value would blow up
    // the daily return (a big contribution against a V that never moved).
    if (!closesByTicker.has(t)) continue;
    let bucket = gridOnOrAfter(rd);
    const priced = firstPricedGrid(t);
    if (bucket && priced && priced > bucket) bucket = priced;
    if (!bucket) continue;
    if (r.action === "buy") {
      contribByDate.set(
        bucket,
        (contribByDate.get(bucket) ?? 0) +
          toPrimary(r.price * r.quantity + r.fee, pos.currency, rd),
      );
    } else if (r.action === "sell") {
      contribByDate.set(
        bucket,
        (contribByDate.get(bucket) ?? 0) -
          toPrimary(r.price * r.quantity - r.fee, pos.currency, rd),
      );
    } else if (r.action === "capitalReduction" && r.price > 0) {
      contribByDate.set(
        bucket,
        (contribByDate.get(bucket) ?? 0) - toPrimary(r.price * r.quantity, pos.currency, rd),
      );
    } else if (r.action === "cashDividend") {
      const total = r.quantity > 0 ? r.price * r.quantity : r.price;
      incomeByDate.set(
        bucket,
        (incomeByDate.get(bucket) ?? 0) + toPrimary(total - r.fee, pos.currency, rd),
      );
    }
  }

  // Chain daily factors where the prior value is positive; a zero prior value
  // (fresh capital entering an empty portfolio) starts a new sub-period without
  // attributing a return.
  const series: Array<{ date: string; pct: number }> = [{ date: grid[0], pct: 0 }];
  let index = 1;
  let observations = 0;
  let prevV = valueOn(grid[0]);
  for (let i = 1; i < grid.length; i += 1) {
    const d = grid[i];
    const v = valueOn(d);
    if (prevV > EPS) {
      const r = (v - prevV - (contribByDate.get(d) ?? 0) + (incomeByDate.get(d) ?? 0)) / prevV;
      index *= 1 + r;
      observations += 1;
    }
    series.push({ date: d, pct: (index - 1) * 100 });
    prevV = v;
  }

  return {
    twrPct: observations >= MIN_ANALYTICS_DAYS ? (index - 1) * 100 : null,
    series,
    observations,
    excludedTickers,
  };
}

/**
 * Benchmark value series (a single ticker's daily closes within the window).
 * Returned raw — cumulative return is scale-free, so no FX conversion needed.
 */
export function buildBenchmarkSeries(
  dailyPrices: DailyPriceSeriesRow[],
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
export function alignByDate(
  a: ValuePoint[],
  b: ValuePoint[],
): { a: ValuePoint[]; b: ValuePoint[] } {
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
  dailyPrices: DailyPriceSeriesRow[];
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

export interface Mover {
  ticker: string;
  name: string;
  changePercent: number;
  /** Best-known timestamp/date for the current price (quote time or close date). */
  marketTime: string | null;
}

export interface DayChangeQuote {
  symbol: string;
  /** Live / latest price. */
  price: number;
  marketTime?: string | null;
}

/**
 * Today's movers among *held* tickers — correct intraday, after-hours, and on
 * weekends/holidays. The change is always **the current session vs the session
 * before it**, never "vs today" (which reads 0% on a non-trading day because the
 * live price already equals the latest recorded close).
 *
 * The reference close comes from daily_prices, never a live quote's
 * `previousClose` (which can be garbage for post-spinoff tickers → +3000%).
 *
 * Let `lastClose` be the most recent daily close and `prevClose` the one before:
 *   - With a live quote, compare its session date to `lastClose`:
 *       · quote newer than lastClose (intraday — today's close not recorded yet):
 *         current = live quote, reference = lastClose (the prior session).
 *       · quote same session as lastClose (after close, or a weekend showing the
 *         last session): current = live quote, reference = prevClose.
 *   - No quote: current = lastClose, reference = prevClose.
 *
 * So on a Saturday the latest close is Friday and the reference is Thursday —
 * exactly "Friday vs Thursday". Sorted best → worst, limited to `limit` (7).
 */
export function dayChangeMovers(opts: {
  dailyPrices: DailyPriceSeriesRow[];
  quotes: DayChangeQuote[];
  heldTickers: Iterable<string>;
  limit?: number;
  nameFor?: (ticker: string) => string | null | undefined;
}): Mover[] {
  const heldTickers = [...opts.heldTickers].map((t) => t.toUpperCase());
  const held = new Set(heldTickers.flatMap(quoteLookupKeys));
  const limit = opts.limit ?? 7;

  const closesByTicker = new Map<string, DailyPriceSeriesRow[]>();
  for (const row of opts.dailyPrices) {
    const keys = quoteLookupKeys(row.ticker).filter((key) => held.has(key));
    for (const key of keys) {
      (closesByTicker.get(key) ?? closesByTicker.set(key, []).get(key)!).push(row);
    }
  }
  for (const rows of closesByTicker.values()) rows.sort((a, b) => a.date.localeCompare(b.date));

  const quoteByTicker = buildQuoteLookup(
    opts.quotes.filter((q) => Number.isFinite(q.price) && q.price > 0),
  );

  const movers: Mover[] = [];
  for (const ticker of heldTickers) {
    const closes = closesByTicker.get(ticker) ?? [];
    const lastClose = closes.length ? closes[closes.length - 1] : null;
    const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
    const quote = findQuoteForTicker(quoteByTicker, ticker);

    let current: number | null = null;
    let reference: number | null = null;
    let asOf: string | null = null;

    if (quote && lastClose) {
      current = quote.price;
      asOf = quote.marketTime ?? lastClose.date;
      const quoteDate = quote.marketTime ? day(quote.marketTime) : null;
      // Quote dated after the last recorded close → that close is the prior
      // session. Otherwise the quote is the latest recorded session → step back.
      reference =
        quoteDate && quoteDate > lastClose.date ? lastClose.close : (prevClose?.close ?? null);
    } else if (lastClose && prevClose) {
      current = lastClose.close;
      reference = prevClose.close;
      asOf = lastClose.date;
    }

    if (current == null || reference == null || !(reference > EPS)) continue;
    movers.push({
      ticker,
      name: opts.nameFor?.(ticker) || ticker,
      changePercent: (current / reference - 1) * 100,
      marketTime: asOf,
    });
  }
  return movers.sort((a, b) => b.changePercent - a.changePercent).slice(0, limit);
}
