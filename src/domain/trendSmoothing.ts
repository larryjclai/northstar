/**
 * Long-view mode (Plan 040, Decision C): dampen daily net-worth volatility by
 * rendering the trend through a trailing moving average.
 *
 * This is a PURE display transform — no React, no I/O. It must never change the
 * underlying series or the headline net-worth number. In particular the LAST
 * point keeps its real value so the chart endpoint still equals the headline
 * (the plan-032 invariant: chart endpoint === big number).
 */

/** Minimum point shape: anything carrying a numeric `value`. Extra keys are preserved. */
export interface TrendPointLike {
  value: number;
}

export interface SmoothTrendOptions {
  /** Trailing window size in points. Default 30 (≈ a month of daily points). */
  window?: number;
}

/**
 * Trailing moving average over a `{ value }[]` series.
 *
 * - Each output point is the average of itself and up to `window - 1` preceding
 *   points (so early points, with fewer predecessors, average over what exists —
 *   no NaN, no throw on short series).
 * - `window <= 1` returns the input unchanged.
 * - The final point keeps its EXACT real value (chart endpoint === headline).
 * - All non-`value` fields (date, iso, …) are carried through untouched.
 */
export function smoothTrend<T extends TrendPointLike>(
  points: readonly T[],
  options: SmoothTrendOptions = {},
): T[] {
  const window = options.window ?? 30;
  if (window <= 1 || points.length === 0) return points.slice();

  const lastIndex = points.length - 1;
  return points.map((point, i) => {
    // Preserve the real latest value so the endpoint matches the headline.
    if (i === lastIndex) return point;
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    for (let j = start; j <= i; j++) sum += points[j].value;
    const avg = sum / (i - start + 1);
    return { ...point, value: avg };
  });
}
